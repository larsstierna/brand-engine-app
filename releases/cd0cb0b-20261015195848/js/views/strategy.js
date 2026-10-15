// Gate 1 of the week: which post strategy this week? Shows the brand story, the engine's recommendation with its reasons,
// and every strategy the author uses with its reasoning chain. The choice is written to decisions/strategy.json, which
// starts discovery aimed at that strategy. No answer by the deadline: the recommendation is used.

import { $$, html, toast } from "../util.js";
import { pageHead, weekEyebrow, withSaving, engineNote, renderInto, brandStory, arcFromLedger } from "../ui.js";
import { fullSteps, chainSummary } from "../chain-editor.js";
import { firstDiscovery } from "../automation.js";

const DAY = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
const when = (s) => (s ? `${DAY[s.day] || s.day} ${s.time}` : "");

export default async function view(ctx, root) {
  const [wk, brand, mem, lib, box, chains] = await Promise.all([ctx.data.week(ctx.author, ctx.week), ctx.data.brand(ctx.author),
    ctx.data.memory(ctx.author), ctx.data.moveLibrary(), ctx.data.toolbox(), ctx.data.chains(ctx.author)]);
  const libById = Object.fromEntries((lib.moves || []).map((m) => [m.id, m]));
  const arc = wk.arc || arcFromLedger(mem.ledger, brand.strategy, mem.posts, lib.moves, ctx.authorCfg.calibration_start || "");
  const rec = arc.recommended?.move;
  const balance = Object.fromEntries((arc.moves || []).map((m) => [m.id, m]));
  const mine = (brand.moves.moves || []).map((m) => m.id).sort((a, b) => (a !== rec) - (b !== rec) || (balance[b]?.need ?? 0) - (balance[a]?.need ?? 0));
  const dec = wk.decisions.strategy;
  const open = ["new", "strategy", "skipped"].includes(wk.state.stage) && !dec;
  const sched = ctx.authorCfg.schedule || {};
  const back = { href: `#/week?author=${ctx.author}&week=${ctx.week}`, label: "This week" };
  const chosenName = dec ? (dec.action === "auto" ? `the recommendation (${arc.recommended?.name || "–"})` : libById[dec.move]?.name || dec.move) : null;

  renderInto(root, html`
    ${pageHead({ eyebrow: weekEyebrow(ctx.week), title: firstDiscovery(wk, mem, ctx.authorCfg) ? "Strategy is optional for first discovery" : "Which strategy this week?", back,
      sub: "Your strategy decides how the engine looks for stories and how the post is reasoned. The recommendation keeps your brand in balance; you can always choose another.",
      right: dec ? html`<span class="pill accent">Chosen: ${chosenName}</span>` : "" })}
    ${brandStory(arc)}
    <p class="small muted">Recent strategies: ${mem.posts.filter((post) => !post.history && post.week < ctx.week && post.week >= String(ctx.authorCfg.calibration_start || "") && post.move).slice(-4).map((post) => `${post.week}: ${libById[post.move]?.name || post.move}`).join("; ") || "No posts since your fresh start."}</p>
    ${dec ? html`<div class="notice ok">Strategy saved: ${chosenName}. ${wk.candidates?.candidates?.length ? "Your story cards are available." : "Story discovery is the next step; no further strategy choice is needed."} <a href="#/week?author=${ctx.author}&week=${ctx.week}">Track this package</a>.</div>` : !open ? html`<div class="notice info">This package has passed strategy selection. Start a new package on This week to change its strategy.</div>` : ""}
    <div class="grid-2">${mine.map((id) => {
      const m = libById[id] || { id, name: id };
      const b = balance[id] || {};
      const steps = fullSteps(chains[id]?.steps?.length ? chains[id].steps : (m.steps || []), box);
      const isChosen = dec?.action === "choose" ? dec.move === id : dec?.action === "auto" && id === rec;
      return html`<article class="card story ${isChosen ? "chosen" : ""}" data-id="${id}">
        <div class="top"><span class="small muted">${id === rec ? "Recommended" : Number.isFinite(b.need) ? `Need ${Math.round(b.need)}/10` : "Need not recorded"}</span>
          ${Number.isFinite(b.actual_share) && Number.isFinite(b.target_share) && b.actual_share < b.target_share ? html`<span class="chip warn">below target share</span>` : ""}</div>
        <h3>${m.name}</h3>
        <p class="why">${m.feels_like || m.idea || ""}</p>
        <p class="small muted strategy-measures">${Number.isFinite(b.served) ? `${b.served} recent posts` : "Post count not recorded"} · ${Number.isFinite(b.target_share) ? `target ${Math.round(b.target_share * 100)}%` : "target not recorded"} · ${Number.isFinite(b.need) ? `need ${Math.round(b.need)}/10` : "need not recorded"}${b.last_week ? ` · last used ${b.last_week}` : ""}</p>
        <details class="small"><summary>How it thinks (${steps.length} steps)</summary>${chainSummary(steps)}</details>
        <button class="btn ${id === rec ? "primary" : ""} choose" data-id="${id}" ${open ? "" : "disabled"} style="align-self:flex-start">${isChosen ? "Chosen" : `Use ${m.name}`}</button>
      </article>`;
    })}</div>
    <section class="card row between" style="gap:16px">
      <div class="stack-s" style="flex:1 1 320px"><h2>No preference this week?</h2>
        <p class="small muted">Choose the recommended approach for this post.</p></div>
      <button class="btn" id="auto" ${open ? "" : "disabled"}>Let the engine choose</button></section>
  `);

  const decide = async (btn, data, msg) => {
    await withSaving(btn, () => ctx.data.decide(ctx.author, ctx.week, "strategy", data, wk.package?.id || null), msg);
    toast(engineNote(ctx.backend));
    ctx.refresh();
  };
  $$(".choose", root).forEach((b) => b.addEventListener("click", () => decide(b, { action: "choose", move: b.dataset.id }, "Strategy chosen. Finding stories…")));
  root.querySelector("#auto")?.addEventListener("click", (e) => decide(e.currentTarget, { action: "auto" }, "The engine will use its recommendation"));
  ctx.watch(() => ctx.data.week(ctx.author, ctx.week), wk);
}
