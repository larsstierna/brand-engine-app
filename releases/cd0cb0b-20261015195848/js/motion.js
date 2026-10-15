export const reduced = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? true;
let navigationTransition;
const viewAnimations = new Set();

export function clearPageMotion(root) {
  for (const entry of viewAnimations) if (entry.root === root) entry.animation.cancel();
}

export function cancelPageTransition() {
  navigationTransition?.skipTransition();
}

export async function transitionPage(update) {
  cancelPageTransition();
  if (reduced() || !document.startViewTransition) return update(false);
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  const transition = document.startViewTransition(() => update(true));
  navigationTransition = transition;
  const stop = () => { if (preference.matches) transition.skipTransition(); };
  preference.addEventListener("change", stop);
  transition.ready.catch(() => {});
  transition.finished.catch(() => {}).finally(() => {
    preference.removeEventListener("change", stop);
    if (navigationTransition === transition) navigationTransition = null;
  });
  return transition.updateCallbackDone;
}

function play(element, frames, exit = false) {
  if (reduced() || !element?.animate) return;
  const tokens = getComputedStyle(document.documentElement);
  for (const previous of element.getAnimations()) previous.cancel();
  const animation = element.animate(frames, {
    duration: Math.min(280, Number.parseFloat(tokens.getPropertyValue(exit ? "--motion-out" : "--motion-in")) || 240),
    easing: tokens.getPropertyValue("--ease-out").trim() || "ease-out",
  });
  const entry = { root: element.closest("#view"), animation };
  if (entry.root) viewAnimations.add(entry);
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  const stop = () => { if (preference.matches) animation.cancel(); };
  preference.addEventListener("change", stop);
  const clear = () => { preference.removeEventListener("change", stop); viewAnimations.delete(entry); };
  animation.finished.then(clear, clear);
  return animation;
}

export function pageTransition(root) {
  if (reduced()) return;
  if (root.querySelector(".week-ribbon")) {
    playRibbon(root.querySelector(".week-ribbon"));
    settleCard(root.querySelector(".week-action"));
    play(root.querySelector(".home-brand"), [{ opacity: .3, transform: "translateX(14px)" }, { opacity: 1, transform: "translateX(0)" }]);
    play(root.querySelector(".status-orb"), [{ opacity: .4, transform: "translateY(10px) scale(.95)" }, { opacity: 1, transform: "translateY(0) scale(1)" }]);
    playBarometer(root.querySelector(".brand-barometer"));
    return;
  }
  const content = root.querySelector(".brand-workspace #tab, .package-main") || root;
  return play(content, [{ opacity: .25, transform: "translateY(14px)" }, { opacity: 1, transform: "translateY(0)" }]);
}

export function toastIn(element) {
  if (reduced()) return;
  return play(element, [{ opacity: 0, transform: "translateY(8px) scale(.95)" }, { opacity: 1, transform: "translateY(0) scale(1)" }]);
}

export function toastOut(element) {
  if (reduced()) return;
  return play(element, [{ opacity: 1, transform: "translateY(0) scale(1)" }, { opacity: 0, transform: "translateY(8px) scale(.95)" }], true);
}

export function confirmButton(element) {
  if (reduced()) return;
  return play(element, [{ transform: "scale(.97)" }, { transform: "scale(1)" }]);
}

export function settleCard(element) {
  if (reduced()) return;
  return play(element, [{ opacity: .7, transform: "scale(.98)" }, { opacity: 1, transform: "scale(1)" }]);
}

export function playRibbon(element) {
  if (reduced() || !element) return;
  for (const connector of element.querySelectorAll(".ribbon-connector")) play(connector, [{ transform: "scaleX(.05)", opacity: .3 }, { transform: "scaleX(1)", opacity: 1 }]);
  for (const node of element.querySelectorAll(".ribbon-node")) play(node, [{ transform: "translateY(5px) scale(.95)", opacity: .2 }, { transform: "translateY(0) scale(1)", opacity: 1 }]);
}

export function playDashboard(element) {
  if (reduced() || !element) return;
  for (const fill of element.querySelectorAll(".dashboard-goal:not(.is-muted) .goal-fill")) {
    const final = fill.style.transform;
    if (final === "scaleX(0)") continue;
    play(fill, [{ transform: "scaleX(.05)", opacity: .45 }, { transform: final, opacity: 1 }]);
  }
  for (const dot of element.querySelectorAll(".week-dot[data-goal]:not(.is-muted)")) play(dot, [{ transform: "translateY(7px) scale(.95)", opacity: .3 }, { transform: "translateY(0) scale(1)", opacity: 1 }]);
}

export function smoothList(element, update) {
  if (reduced()) { update(); return; }
  const before = new Map([...element.children].map((child) => [child, child.getBoundingClientRect()]));
  update();
  for (const child of element.children) {
    const previous = before.get(child);
    if (!previous) { settleCard(child); continue; }
    const current = child.getBoundingClientRect();
    if (previous.top !== current.top || previous.left !== current.left) play(child, [{ transform: `translate(${previous.left - current.left}px,${previous.top - current.top}px)` }, { transform: "translate(0,0)" }]);
  }
}

export function bindPageMotion(root, signal) {
  signal?.addEventListener("abort", () => clearPageMotion(root), { once: true });
  if (reduced()) {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    preference.addEventListener("change", () => { if (!preference.matches) bindPageMotion(root, signal); }, { once: true, signal });
    return;
  }
  let keyboard = false;
  let interacted = -Infinity;
  const disclosures = new WeakSet();
  root.addEventListener("keydown", () => { keyboard = true; }, { signal });
  root.addEventListener("pointerdown", () => { keyboard = false; interacted = performance.now(); }, { signal });
  root.addEventListener("click", (event) => {
    if (!event.detail) keyboard = true;
    if (keyboard) return;
    interacted = performance.now();
    const summary = event.target.closest("summary");
    if (summary?.parentElement.tagName === "DETAILS") disclosures.add(summary.parentElement);
  }, { signal });
  root.addEventListener("toggle", (event) => {
    const details = event.target;
    if (!disclosures.has(details)) return;
    disclosures.delete(details);
    if (reduced() || keyboard || !details.open) return;
    for (const child of details.children) if (child.tagName !== "SUMMARY") settleCard(child);
  }, { signal, capture: true });
  const observer = new MutationObserver((changes) => {
    if (reduced() || keyboard || performance.now() - interacted > 250) return;
    for (const change of changes) {
      if (change.type === "attributes" && change.attributeName === "hidden" && !change.target.hidden) settleCard(change.target);
      if (change.type === "attributes" && change.attributeName === "aria-pressed" && change.target.getAttribute("aria-pressed") === "true") confirmButton(change.target);
      for (const node of change.addedNodes) if (node.nodeType === 1 && node.matches(".reader, .chain-step, .list-row")) settleCard(node);
    }
  });
  observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "aria-pressed"] });
  signal?.addEventListener("abort", () => observer.disconnect(), { once: true });
}

export function playBarometer(element) {
  if (reduced() || !element) return;
  const needle = element.querySelector(".barometer-needle");
  if (!needle) return;
  return play(needle, [{ transform: "rotate(-90deg)", opacity: .4 }, { transform: needle.style.transform, opacity: 1 }]);
}