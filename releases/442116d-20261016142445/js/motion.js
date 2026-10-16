import { animate as animeAnimate, stagger, eases } from "../vendor/anime.esm.min.js";
export const reduced = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? true;
let navigationTransition;
const viewAnimations = new Set();
const animeRuns = new Map();

function clearAnimeRun(root) {
  const entry = animeRuns.get(root);
  if (!entry) return;
  entry.signal?.removeEventListener("abort", entry.abort);
  entry.preference?.removeEventListener("change", entry.stop);
  for (const animation of entry.animations) animation.revert();
  animeRuns.delete(root);
}

function trackAnimeRun(root, signal, animations) {
  clearAnimeRun(root);
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  const entry = { animations, signal, abort: null, preference, stop: null };
  entry.abort = () => clearAnimeRun(root);
  entry.stop = () => { if (preference.matches) clearAnimeRun(root); };
  animeRuns.set(root, entry);
  signal?.addEventListener("abort", entry.abort, { once: true });
  preference.addEventListener("change", entry.stop);
  Promise.all(animations.map((animation) => animation.then())).then(() => {
    if (animeRuns.get(root) !== entry) return;
    for (const animation of animations) animation.revert();
    signal?.removeEventListener("abort", entry.abort);
    preference.removeEventListener("change", entry.stop);
    animeRuns.delete(root);
  }, () => clearAnimeRun(root));
}

export function clearPageMotion(root) {
  for (const entry of viewAnimations) if (entry.root === root) entry.animation.cancel();
  clearAnimeRun(root);
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

export function playJourney(root, signal) {
  if (reduced()) return;
  const journey = root.querySelector(".week-journey");
  if (!journey) return;
  const animations = [];
  const nodes = [...journey.querySelectorAll(".journey-node")];
  const completedLines = [...journey.querySelectorAll(".journey-work.done .journey-work-line i")];
  const halo = journey.querySelector(".journey-node.now .journey-halo, .journey-node.running .journey-halo");
  if (nodes.length) animations.push(animeAnimate(nodes, {
    opacity: [0, 1], translateY: [8, 0], delay: stagger(70), duration: 240, ease: eases.outExpo,
  }));
  if (completedLines.length) animations.push(animeAnimate(completedLines, {
    scaleX: [0, 1], delay: stagger(70), duration: 200, ease: eases.outExpo, transformOrigin: "left center",
  }));
  if (halo) animations.push(animeAnimate(halo, {
    scale: [.85, 1.5], opacity: [.7, 0], duration: 280, delay: 280, ease: eases.outQuad, loop: 2,
  }));
  if (!animations.length) return;
  trackAnimeRun(root, signal, animations);
  Promise.all(animations.map((animation) => animation.then())).then(() => {
    if (journey.isConnected && !reduced()) journey.dataset.entered = "true";
  }).catch(() => {});
}

export function playPick(root, signal) {
  if (reduced()) return;
  const cards = [...root.querySelectorAll(".story:not(.dimmed)")];
  const segments = [...root.querySelectorAll(".pick-mix-segment")];
  const animations = [];
  if (segments.length) animations.push(animeAnimate(segments, {
    scaleX: [0, 1], delay: stagger(35), duration: 260, ease: eases.outExpo, transformOrigin: "left center",
  }));
  if (cards.length && !root.querySelector(".story.chosen")) animations.push(animeAnimate(cards, {
    opacity: [.35, 1], translateY: [12, 0], delay: stagger(70), duration: 260, ease: eases.outExpo,
  }));
  const chosen = root.querySelector(".story.chosen");
  if (chosen) animations.push(animeAnimate(chosen, {
    scale: [.97, 1], opacity: [.75, 1], duration: 180, delay: 180, ease: eases.outExpo,
  }));
  if (animations.length) {
    trackAnimeRun(root, signal, animations);
    Promise.all(animations.map((animation) => animation.then())).then(() => {
      if (root.isConnected && !reduced()) root.dataset.pickRevealed = "true";
    }).catch(() => {});
  }
}

export function foldPackageLock(root, signal) {
  const band = root.querySelector(".package-lock-band");
  if (reduced() || !band) return Promise.resolve();
  const animation = animeAnimate(band, { opacity: [1, 0], translateY: [0, -12], duration: 180, ease: eases.outExpo });
  trackAnimeRun(root, signal, [animation]);
  return animation.then().catch(() => {});
}

export function playUnlock(root, signal) {
  if (reduced()) return;
  const journey = root.querySelector(".week-journey");
  const targets = [root.querySelector(".journey-node.now .journey-marker"), root.querySelector(".week-action .btn.primary")].filter(Boolean);
  const animations = targets.map((element) => animeAnimate(element, {
    scale: [.95, 1], opacity: [.75, 1], duration: 180, ease: eases.outExpo,
  }));
  if (animations.length) {
    trackAnimeRun(root, signal, animations);
    Promise.all(animations.map((animation) => animation.then())).then(() => {
      if (journey?.isConnected && !reduced()) journey.dataset.unlocked = "true";
    }).catch(() => {});
  }
}

export function crossfadeStep(element) {
  if (reduced() || !element) return;
  return play(element, [{ opacity: .35 }, { opacity: 1 }]);
}

export function pageTransition(root, signal, { unlock = false } = {}) {
  if (reduced()) return;
  if (root.querySelector(".week-journey")) return unlock ? playUnlock(root, signal) : playJourney(root, signal);
  if (root.querySelector(".pick-mix")) return playPick(root, signal);
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
