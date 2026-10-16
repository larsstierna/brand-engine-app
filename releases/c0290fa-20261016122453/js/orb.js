import { reduced } from "./motion.js";

let dispose = () => {};
export function clearOrb() { dispose(); dispose = () => {}; }

export function mountOrb(root) {
  clearOrb();
  const canvas = root.querySelector(".status-orb canvas");
  const context = canvas?.getContext("2d");
  if (!context) return;
  canvas.parentElement.classList.add("has-canvas");
  const phase = canvas.parentElement.dataset.phase || "decision";
  const working = ["running", "queued", "handoff"].includes(phase);
  const finished = phase === "done";
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  const theme = matchMedia("(prefers-color-scheme: dark)");
  let frame = 0, last = 0, visible = false, stopped = false, time = 0;
  let palette;
  const readPalette = () => {
    const tokens = getComputedStyle(document.documentElement);
    palette = Object.fromEntries(["--orb-highlight", "--orb-light", "--clay", "--orb-shade", "--orb-shadow", "--goal-3"].map((name) => [name, tokens.getPropertyValue(name).trim()]));
  };
  const draw = () => {
    const size = canvas.width;
    context.clearRect(0, 0, size, size);
    const center = size / 2;
    context.save();
    context.translate(0, finished ? 0 : Math.sin(time * (working ? 1.2 : .8)) * size * .012);
    context.beginPath();
    for (let point = 0; point <= 96; point++) {
      const angle = point * Math.PI * 2 / 96;
      const radius = size * (.36 + (finished ? 0 : .025 * Math.sin(angle * 3 + time) + .014 * Math.cos(angle * 2 - time * (working ? 1.1 : .7))));
      const horizontal = center + Math.cos(angle) * radius;
      const vertical = center + Math.sin(angle) * radius;
      if (point === 0) context.moveTo(horizontal, vertical); else context.lineTo(horizontal, vertical);
    }
    context.closePath();
    context.shadowColor = palette["--orb-shadow"];
    context.shadowBlur = size * .055;
    context.shadowOffsetY = size * .045;
    const base = context.createLinearGradient(size * .2, size * .2, size * .8, size * .9);
    base.addColorStop(0, finished ? palette["--orb-highlight"] : palette["--orb-light"]);
    base.addColorStop(.45, finished ? palette["--goal-3"] : palette["--clay"]);
    base.addColorStop(1, finished ? palette["--goal-3"] : palette["--orb-shade"]);
    context.fillStyle = base;
    context.fill();
    context.shadowBlur = 0;
    context.shadowOffsetY = 0;
    context.clip();
    for (let band = 0; band < 3; band++) {
      context.save();
      context.translate(center, center);
      context.rotate(Math.sin(time * (working ? .7 : .35)) * .2 + band * .24 - .7);
      const offset = Math.sin(time * (working ? 1.25 : .7) + band * 1.8) * size * .06;
      const sheen = context.createLinearGradient(-size * .4, -size * .3, size * .4, size * .4);
      sheen.addColorStop(0, palette["--orb-highlight"]);
      sheen.addColorStop(.5, palette["--orb-light"]);
      sheen.addColorStop(1, palette["--orb-shade"]);
      context.globalAlpha = .14 + band * .035;
      context.strokeStyle = sheen;
      context.lineWidth = size * (.11 + band * .025);
      context.beginPath();
      context.moveTo(-size * .5, offset - size * .13);
      context.bezierCurveTo(-size * .05, offset - size * .36, size * .02, offset + size * .4, size * .5, offset + size * .06);
      context.stroke();
      context.restore();
    }
    const highlight = context.createRadialGradient(size * (.33 + .045 * Math.sin(time * (working ? 1 : .6))), size * (.28 + .035 * Math.cos(time * (working ? .9 : .5))), 0, size * .34, size * .3, size * .35);
    highlight.addColorStop(0, palette["--orb-highlight"]);
    highlight.addColorStop(.15, palette["--orb-light"]);
    highlight.addColorStop(1, "transparent");
    context.globalAlpha = .8;
    context.fillStyle = highlight;
    context.fillRect(0, 0, size, size);
    context.restore();
    canvas.dataset.frames = String(Number(canvas.dataset.frames || 0) + 1);
  };
  const tick = (timestamp) => {
    if (stopped || finished || !visible || document.hidden || reduced()) { frame = 0; canvas.dataset.running = "false"; return; }
    if (timestamp - last >= 40) { time += working ? .065 : .028; draw(); last = timestamp; }
    canvas.dataset.running = "true";
    frame = requestAnimationFrame(tick);
  };
  const sync = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    canvas.dataset.running = "false";
    readPalette();
    if (reduced() || finished) time = 0;
    draw();
    if (reduced() || !visible || document.hidden || stopped) return;
    frame = requestAnimationFrame(tick);
  };
  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
  observer.observe(canvas);
  document.addEventListener("visibilitychange", sync);
  media.addEventListener("change", sync);
  theme.addEventListener("change", sync);
  const themeObserver = new MutationObserver(sync);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  readPalette();
  draw();
  dispose = () => {
    stopped = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    themeObserver.disconnect();
    document.removeEventListener("visibilitychange", sync);
    media.removeEventListener("change", sync);
    theme.removeEventListener("change", sync);
    canvas.dataset.running = "false";
  };
}