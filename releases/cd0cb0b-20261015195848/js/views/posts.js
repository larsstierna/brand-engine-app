// Posts and brand: is the brand moving? Goal coverage, every post with its numbers, and the positions taken.

import { $, $$, html, toast, shiftWeek } from "../util.js";
import { pageHead, empty, withSaving, renderInto } from "../ui.js";

const median = (xs) => {
  const v = xs.filter((x) => typeof x === "number").sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const metric = (p, k) => p.metrics?.d7?.[k] ?? p.metrics?.d2?.[k];

function metricsForm(p) {
  const m = p.metrics?.d7 || p.metrics?.d2 || {};
  return html`<tr class="metrics-row" data-week="${p.week}" hidden><td colspan="7">
    <form class="stack-s metrics-form" data-week="${p.week}">
      <div class="row">
        <label class="field">Day<select name="day"><option value="2">Day 2</option><option value="7" ${p.metrics?.d2 ? "selected" : ""}>Day 7</option></select></label>
        <label class="field">Impressions<input type="number" min="0" name="impressions" value="${m.impressions ?? ""}"></label>
        <label class="field">Saves<input type="number" min="0" name="saves" value="${m.saves ?? ""}"></label>
        <label class="field">Comments<input type="number" min="0" name="comments" value="${m.comments ?? ""}"></label>
        <label class="field">Reactions<input type="number" min="0" name="reactions" value="${m.reactions ?? ""}"></label>
        <label class="field">Your rating<select name="rating"><option value="">–</option>${[1, 2, 3, 4, 5].map((n) => html`<option ${p.rating === n ? "selected" : ""}>${n}</option>`)}</select></label>
      </div>
      <label class="field">What would you change next time? (optional)<input type="text" name="note" value="${p.note || ""}"></label>
      <button class="btn primary small" style="align-self:flex-start">Save numbers</button>
    </form></td></tr>`;
}

export default async function view(ctx, root) {
  const mem = await ctx.data.memory(ctx.author);
  const start = ctx.authorCfg.calibration_start ? String(ctx.authorCfg.calibration_start) : "";
  // Clean slate: posts before calibration_start (or marked history) are kept but count for nothing.
  const isHistory = (p) => !!p.history || (/^\d{4}-W\d{2}$/.test(start) && p.week < start);
  const showHistory = ctx.params.get("history") === "1";
  const all = [...mem.posts].reverse();
  const nHistory = all.filter(isHistory).length;
  const posts = showHistory ? all : all.filter((p) => !isHistory(p));
  const counted = posts.filter((p) => ["posted", "measured"].includes(p.status) && !isHistory(p));
  const ratings = counted.map((p) => p.rating);
  const saves = counted.map((p) => metric(p, "saves"));
  const nSaves = saves.filter((x) => typeof x === "number").length;
  const recent = counted.filter((post) => post.week >= shiftWeek(ctx.week, -11) && post.week <= ctx.week);
  const measured = recent.filter((post) => typeof post.metrics?.d7?.saves === "number");
  const usual = median(measured.map((post) => post.metrics.d7.saves));
  const best = measured.length >= 3 ? [...measured].sort((first, second) => second.metrics.d7.saves - first.metrics.d7.saves)[0] : null;
  const missing = counted.filter((post) => !post.metrics?.d2 && !post.metrics?.d7).length;

  renderInto(root, html`
    ${pageHead({ title: "Posts", sub: "Your publishing record and results.", right: html`<a class="btn small" href="#/runs?author=${ctx.author}">Package runs</a>` })}
    <section class="brand-insight"><p>${counted.length} published post${counted.length === 1 ? "" : "s"} since your fresh start.</p>
      <p class="small muted">${missing ? `${missing} published post${missing === 1 ? " is" : "s are"} missing numbers.` : "All published posts have at least one set of numbers."}</p>
      ${best ? html`<p class="small">Most saves in the last 12 weeks: <a href="#/ready?author=${ctx.author}&week=${best.week}">${best.first_line || best.headline || best.week}</a> · ${best.metrics.d7.saves} day-7 saves.</p>` : html`<p class="small muted">Post comparisons appear after three day-7 save results. Day-2 and day-7 results are not mixed.</p>`}
    </section>
    <div class="grid-4">
      <div class="stat"><div class="label">Posts</div><div class="value">${counted.length}</div></div>
      <div class="stat"><div class="label">Your rating, median</div><div class="value">${median(ratings) ?? "–"}</div></div>
      <div class="stat"><div class="label">Saves per post, median</div><div class="value">${nSaves >= 3 ? median(saves) : "–"}</div><div class="small muted">${nSaves < 3 ? "needs 3 posts with numbers" : `n = ${nSaves}`}</div></div>
      <div class="stat"><div class="label">Missing numbers</div><div class="value">${missing}</div></div>
    </div>
    <section class="card" aria-labelledby="t" style="padding:10px 10px 4px">
      <div class="row between" style="margin:10px 12px 6px"><h2 id="t">Posts</h2>
        ${nHistory ? html`<a class="small" href="#/posts?author=${ctx.author}${showHistory ? "" : "&history=1"}">${showHistory ? "Hide" : "Show"} earlier history (${nHistory})</a>` : ""}</div>
      ${posts.length ? html`<div class="table-wrap"><table>
        <thead><tr><th>Week</th><th>Story</th><th>Goal · strategy · shape</th><th>Status</th><th class="num">Rating</th><th class="num">Saves</th><th></th></tr></thead>
        <tbody>${posts.map((p) => html`<tr>
          <td class="mono">${p.week}${isHistory(p) ? html`<div class="small muted">history</div>` : ""}</td>
          <td>${p.first_line || p.headline}${p.url ? html` · <a href="${p.url}" target="_blank" rel="noopener">post</a>` : ""}</td>
          <td>${p.goal || "–"}<div class="small muted">${[p.move, p.format].filter(Boolean).join(" · ")}</div></td>
          <td><span class="chip ${p.status === "posted" || p.status === "measured" ? "ok" : ""}">${p.status}</span></td>
          <td class="num">${p.rating ?? "–"}</td><td class="num">${metric(p, "saves") ?? "–"}${usual > 0 && measured.includes(p) && measured.length >= 3 ? html`<div class="small muted">${(p.metrics.d7.saves / usual).toFixed(1)}x usual · day 7</div>` : ""}</td>
          <td>${p.archived_run ? html`<a class="btn small" href="#/runs?author=${ctx.author}&week=${p.week}&run=${p.archived_run}">Saved package</a>` : html`<button class="btn small add" data-week="${p.week}">${metric(p, "impressions") != null ? "Edit" : "Add numbers"}</button>`}</td></tr>
          ${p.archived_run ? "" : metricsForm(p)}`)}</tbody></table></div>` : empty("No posts yet", nHistory ? "Your brand counts from your first new post. Earlier posts are kept as history." : "Your posts appear here once the first week is done.")}
    </section>
  `);

  $$(".add", root).forEach((b) => b.addEventListener("click", () => {
    const row = $(`.metrics-row[data-week="${b.dataset.week}"]`, root);
    row.hidden = !row.hidden;
  }));
  const want = ctx.params.get("rate");
  root.addEventListener("input", () => ctx.setDirty(true));
  if (want) { const row = $(`.metrics-row[data-week="${want}"]`, root); if (row) { row.hidden = false; row.scrollIntoView({ block: "center" }); } }
  $$(".metrics-form", root).forEach((f) => f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const data = { day: Number(fd.get("day")) };
    for (const k of ["impressions", "saves", "comments", "reactions"]) if (fd.get(k) !== "") data[k] = Number.parseInt(fd.get(k), 10);
    if (fd.get("rating")) data.rating = Number(fd.get("rating"));
    if (fd.get("note")) data.note = fd.get("note");
    const post = posts.find((row) => row.week === f.dataset.week && !row.archived_run);
    await withSaving(f.querySelector("button"), () => ctx.data.decide(ctx.author, f.dataset.week, "metrics", data, post?.package_id || null), "Numbers saved");
    toast("The goal ledger updates in a minute.");
    ctx.refresh();
  }));
}
