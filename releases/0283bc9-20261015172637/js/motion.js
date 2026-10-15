export const reduced = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? true;

function play(element, frames, exit = false) {
  if (reduced() || !element?.animate) return;
  const tokens = getComputedStyle(document.documentElement);
  for (const previous of element.getAnimations()) previous.cancel();
  const animation = element.animate(frames, {
    duration: Math.min(280, Number.parseFloat(tokens.getPropertyValue(exit ? "--motion-out" : "--motion-in")) || 240),
    easing: tokens.getPropertyValue("--ease-out").trim() || "ease-out",
  });
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  const stop = () => { if (preference.matches) animation.cancel(); };
  preference.addEventListener("change", stop);
  const clear = () => preference.removeEventListener("change", stop);
  animation.finished.then(clear, clear);
  return animation;
}

export function pageTransition(root) {
  if (reduced()) return;
  if (root.querySelector(".week-ribbon")) {
    playRibbon(root.querySelector(".week-ribbon"));
    settleCard(root.querySelector(".week-action"));
    play(root.querySelector(".status-orb"), [{ opacity: .4, transform: "translateY(10px) scale(.95)" }, { opacity: 1, transform: "translateY(0) scale(1)" }]);
    return;
  }
  return play(root, [{ opacity: .75 }, { opacity: 1 }]);
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