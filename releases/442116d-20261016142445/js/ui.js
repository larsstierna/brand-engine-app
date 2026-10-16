// Shared view pieces: page header, the week's stepper, goal bars, empty states, saving with feedback.

import { html, raw, toast, weekRange, niceDate } from "./util.js";
import { goalColor } from "./week-dashboard.js";
import { icon } from "./icons.js";
import { confirmButton } from "./motion.js";

export const STAGES = [
  { id: "picked", name: "Pick story", hint: "You, ~2 min" },
  { id: "research", name: "Research", hint: "Saved evidence" },
  { id: "researched", name: "Opinion", hint: "You, ~1 min" },
  { id: "drafted", name: "Draft", hint: "~25 min" },
  { id: "approved", name: "Approve", hint: "You, ~3 min" },
  { id: "ready", name: "Ready", hint: "Image, comment" },
  { id: "posted", name: "Posted", hint: "By you" },
  { id: "measured", name: "Measured", hint: "Day 2 and 7" },
];
const ORDER = ["new", "strategy", "discovered", "picked", "researched", "drafted", "revising", "approved", "ready", "posted", "measured"];

export function weekFlow(week) {
  if ([1, 2].includes(week.state?.flow)) return week.state.flow;
  if ([1, 2].includes(week.package?.flow)) return week.package.flow;
  const started = ["picked", "researched", "drafted", "revising", "approved", "ready", "posted", "measured"];
  return started.includes(week.state?.stage) || week.state?.history?.some((event) => started.includes(event.stage)) ? 1 : 2;
}

export function stagesFor(week) {
  return weekFlow(week) === 2 ? STAGES : STAGES.filter((step) => !["research", "researched"].includes(step.id));
}

// Engine stages stay in ORDER; only author-facing steps appear in STAGES.
export function stageIndex(stage, flow = 1) {
  if (["new", "strategy", "discovered", "failed", "skipped"].includes(stage)) return -1;
  const steps = flow === 2 ? STAGES : STAGES.filter((step) => !["research", "researched"].includes(step.id));
  return steps.findIndex((step) => step.id === (stage === "revising" ? "drafted" : stage === "researched" ? "research" : stage));
}
export const atLeast = (stage, target) => ORDER.indexOf(stage) >= ORDER.indexOf(target);

export function pageHead({ eyebrow = "", title, sub = "", back = null, right = "" }) {
  return html`<div class="page-head"><div>
      ${back ? html`<a class="back" href="${back.href}">← ${back.label}</a>` : ""}
      <h1>${title}</h1>${eyebrow ? html`<p class="sub">${eyebrow}</p>` : ""}${sub ? html`<p class="sub">${sub}</p>` : ""}
    </div>${right}</div>`;
}

export function weekEyebrow(week) {
  return `${week} · ${weekRange(week)}`;
}

export const TONES = ["diplomatic", "balanced", "firm"];

export function toneControl(name, value = "balanced", label = "Tone") {
  return html`<fieldset class="tone-control"><legend>${label}</legend><div class="tone-options">${TONES.map((tone) => html`<label><input type="radio" name="${name}" value="${tone}" ${tone === value ? "checked" : ""}><span>${tone[0].toUpperCase() + tone.slice(1)}</span></label>`)}</div></fieldset>`;
}

export function opinionDefault(week, rules = {}) {
  const option = week.opinions?.options?.find((item) => item.id === week.opinions.recommended);
  return { option, tone: week.brief?.sensitive ? option?.suggested_tone || "diplomatic" : rules.default_tone || "balanced" };
}

export function stepper(state, deadlines = {}) {
  const steps = stagesFor({ state });
  const idx = stageIndex(state.stage, weekFlow({ state }));
  const doneAt = {};
  for (const h of state.history || []) doneAt[h.stage] = h.at;
  return html`<ol class="stepper" aria-label="This week's progress">${steps.map((s, i) => {
    const cls = i <= idx ? "done" : i === idx + 1 ? "now" : "";
    const when = i <= idx ? (doneAt[s.id] ? niceDate(doneAt[s.id]) : "Done") : i === idx + 1 ? (deadlines[s.id] || "Next") : s.hint;
    return html`<li class="${cls}"><div class="bar"></div><span class="name">${s.name}</span><span class="when muted">${when}</span></li>`;
  })}</ol>`;
}

// Share-of-recent-posts bars with a target line. Used for goals and for signature moves (post strategies).
function balanceBars(items, n, { limit = 8, label = (g) => g.question, unit = "post", colored = false } = {}) {
  // The bar shows the real share of recent posts; the engine's need score also uses a small prior so early weeks stay calm.
  const recorded = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
  const share = (g) => recorded(g.served) && recorded(n) ? n ? g.served / n : 0 : null;
  const target = (g) => recorded(g.target_share) ? g.target_share : null;
  const max = Math.max(...items.map((g) => Math.max(share(g) ?? 0, target(g) ?? 0)), 0.01);
  return html`<div class="stack">${items.slice(0, limit).map((g, index) => {
    const needs = g.need >= 7;
    return html`<div class="goalbar ${needs ? "needs" : ""} ${colored ? "goal-colored" : ""}" style="--goal-color:${colored ? goalColor(index) : "var(--accent)"}">
      <div class="top"><span>${label(g)}</span><span class="mono ${needs ? "" : "muted"}" style="${needs ? "color:var(--warn);font-weight:600" : ""}">${recorded(g.served) ? `${g.served} ${unit}${g.served === 1 ? "" : "s"}` : "Post count not recorded"} · ${recorded(g.need) ? `need ${Math.round(g.need)}/10` : "need not recorded"}</span></div>
      ${share(g) !== null || target(g) !== null ? html`<div class="track" title="Bar: recorded share of recent posts. Line: recorded target share.">${share(g) === null ? "" : html`<div class="fill" style="width:${Math.round((share(g) / max) * 100)}%"></div>`}
      ${target(g) === null ? "" : html`<div class="target" style="left:${Math.round((target(g) / max) * 100)}%"></div>`}</div>` : html`<p class="small muted">Mix data not recorded yet.</p>`}</div>`;
  })}</div>`;
}

export function goalBars(ledger, { limit = 8 } = {}) {
  if (!ledger || !ledger.goals?.length) return html`<p class="muted small">No posts counted yet. Goals fill in after the first posts.</p>`;
  return balanceBars(ledger.goals, ledger.posts_in_window || 0, { limit, colored: true });
}

export function moveBars(ledger, { limit = 7 } = {}) {
  const moves = ledger?.move_balance || [];
  if (!moves.length) return html`<p class="muted small">Move balance appears after the next ledger update.</p>`;
  return balanceBars([...moves].sort((a, b) => b.weight - a.weight), ledger.posts_in_window || 0, { limit, label: (m) => m.name });
}

// The brand story: where the author is in building their brand. From weeks/<week>/arc.json (written by the engine from facts);
// before the engine has written it, a smaller version is built here from the same ledger.
export function arcFromLedger(ledger, strategy, posts, lib, calibrationStart = "") {
  const names = Object.fromEntries((lib || []).map((m) => [m.id, m]));
  const moves = (ledger?.move_balance || []).map((m) => ({ ...m, feels_like: names[m.id]?.feels_like || "", idea: names[m.id]?.idea || "" }));
  const rec = [...moves].sort((a, b) => b.need - a.need || b.weight - a.weight)[0];
  const counted = (posts || []).filter((p) => !p.history && (!calibrationStart || p.week >= calibrationStart) && ["drafted", "ready", "posted", "measured"].includes(p.status))
    .sort((a, b) => a.week.localeCompare(b.week)).slice(-4);
  const lines = [];
  if (strategy?.destination) lines.push(`You're building toward: ${strategy.destination}`);
  lines.push(counted.length ? `Your last posts: ${counted.reverse().map((p) => `${p.week} ${names[p.move]?.name || p.move || "no strategy"}`).join("; ")}.`
    : "No posts yet since your fresh start: this week's post is the first of your new brand.");
  if (rec) lines.push(`Recommended this week: ${rec.name}.`);
  return { lines, moves, recommended: rec ? { move: rec.id, name: rec.name } : null, why: [], fallback: true };
}

export function brandStory(arc, { title = "Your brand so far", chosen = null } = {}) {
  if (!arc) return "";
  const why = arc.why || [];
  return html`<section class="card arc stack-s" aria-label="${title}">
    <span class="eyebrow">${title}</span>
    ${(arc.lines || []).map((l, i) => html`<p class="${i === 0 ? "arc-dest" : "small"}" style="margin:0">${l}</p>`)}
    ${chosen ? html`<p class="small" style="margin:0"><strong>This week:</strong> ${chosen}</p>` : ""}
    ${why.length ? html`<details class="small"><summary>Why this recommendation</summary><ul style="margin:6px 0 0;padding-left:18px">${why.map((w) => html`<li>${w}</li>`)}</ul></details>` : ""}
  </section>`;
}

export function empty(title, text, action = "") {
  return html`<div class="empty"><h2>${title}</h2><p>${text}</p>${action}</div>`;
}

export async function withSaving(btn, fn, okMessage = "Saved") {
  const label = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
  try {
    const r = await fn();
    toast(okMessage);
    queueMicrotask(() => {
      if (!btn?.isConnected) return;
      btn.querySelector(".saved-check")?.remove();
      const check = document.createElement("span");
      check.className = "saved-check";
      check.setAttribute("aria-hidden", "true");
      check.innerHTML = icon("check");
      btn.append(check);
      confirmButton(check);
      setTimeout(() => check.remove(), 1400);
    });
    return r;
  } catch (e) {
    console.error(e);
    toast(`Not saved: ${e.message}`, "bad");
    throw e;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
}

export function renderInto(root, content) {
  root.innerHTML = String(content);
}

export function engineNote(backend) {
  return backend?.kind === "local"
    ? "Running locally: steps that need Claude run in GitHub Actions; the rest run on this computer."
    : "The engine picks this up in about a minute (GitHub Actions). You will also get an email.";
}

export const READER_OUTCOMES = { teaches: "Teaches me", "makes-think": "Makes me think", understands: "Understands me", entertains: "Entertains me" };
export { raw };
