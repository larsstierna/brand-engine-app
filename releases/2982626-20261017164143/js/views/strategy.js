// Gate 1 of the week: which post strategy this week? Shows the brand story, the engine's recommendation with its reasons,
// and every strategy the author uses with its reasoning chain. The choice is written to decisions/strategy.json, which
// starts discovery aimed at that strategy. No answer by the deadline: the recommendation is used.

import { html } from "../util.js";
import { pageHead, weekEyebrow, renderInto, brandStory, arcFromLedger } from "../ui.js";
import { fullSteps, chainSummary } from "../chain-editor.js";

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
  const back = { href: `#/week?author=${ctx.author}&week=${ctx.week}`, label: "This week" };
  const chosenName = dec ? (dec.action === "auto" ? `the recommendation (${arc.recommended?.name || "–"})` : libById[dec.move]?.name || dec.move) : null;

  renderInto(root, html`
    ${pageHead({ eyebrow: weekEyebrow(ctx.week), title: "Strategies in your voice", back,
      sub: "The engine blends the relevant strategies for each story. No weekly strategy choice is needed.",
      right: dec ? html`<span class="pill accent">Chosen: ${chosenName}</span>` : "" })}
    ${brandStory(arc)}
    <p class="small muted">Recent strategies: ${mem.posts.filter((post) => !post.history && post.week < ctx.week && post.week >= String(ctx.authorCfg.calibration_start || "") && post.move).slice(-4).map((post) => `${post.week}: ${libById[post.move]?.name || post.move}`).join("; ") || "No posts since your fresh start."}</p>
    ${dec ? html`<div class="notice ok">Saved earlier strategy: ${chosenName}. <a href="#/week?author=${ctx.author}&week=${ctx.week}">Track this package</a>.</div>` : ""}
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
      </article>`;
    })}</div>
    <section class="card row between" style="gap:16px">
      <div class="stack-s" style="flex:1 1 320px"><h2>Your writing defaults</h2></div>
      <a class="btn" href="#/voice?author=${ctx.author}">Your voice</a><a class="btn" href="#/week?author=${ctx.author}&week=${ctx.week}">This week</a></section>
  `);

  ctx.watch(() => ctx.data.week(ctx.author, ctx.week), wk);
}
