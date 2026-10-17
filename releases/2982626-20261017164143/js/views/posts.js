// Posts and brand: is the brand moving? Goal coverage, every post with its numbers, and the positions taken.

import { $, $$, html, toast, shiftWeek } from "../util.js";
import { pageHead, empty, withSaving, renderInto } from "../ui.js";

const median = (xs) => {
  const v = xs.filter((x) => typeof x === "number").sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const dayMetric = (p, day, key) => p.metrics?.[`d${day}`]?.[key];

function savesCell(post, usual, measured) {
  const day2 = dayMetric(post, 2, "saves"), day7 = dayMetric(post, 7, "saves");
  if (typeof day2 !== "number" && typeof day7 !== "number") return "–";
  return html`<div class="post-saves">
    ${typeof day2 === "number" ? html`<span><small>D2</small>${day2}</span>` : ""}
    ${typeof day7 === "number" ? html`<span><small>D7</small>${day7}</span>` : ""}
    ${typeof day7 === "number" && usual > 0 && measured.includes(post) && measured.length >= 3 ? html`<small>${(day7 / usual).toFixed(1)}x usual</small>` : ""}
  </div>`;
}

function metricsForm(p) {
  const metrics = p.metrics || {};
  const day = metrics.d7 ? 7 : metrics.d2 ? 7 : 2;
  const values = metrics[`d${day}`] || {};
  return html`<tr class="metrics-row" data-week="${p.week}" hidden><td colspan="7">
    <form class="metrics-form" data-week="${p.week}" data-day2="${JSON.stringify(metrics.d2 || {})}" data-day7="${JSON.stringify(metrics.d7 || {})}">
      <fieldset class="metric-day-choice"><legend>Results from</legend><div class="metric-day-options">
        ${[2, 7].map((option) => html`<label><input type="radio" name="day" value="${option}" ${day === option ? "checked" : ""}><span>Day ${option}</span></label>`)}
      </div><p class="small muted">Day 2 and Day 7 are stored separately. Brand comparisons use Day 7.</p></fieldset>
      <div class="metrics-input-grid">
        <label class="field">Impressions<input type="number" min="0" name="impressions" value="${values.impressions ?? ""}"></label>
        <label class="field">Saves<input type="number" min="0" name="saves" value="${values.saves ?? ""}"></label>
        <label class="field">Comments<input type="number" min="0" name="comments" value="${values.comments ?? ""}"></label>
        <label class="field">Reactions<input type="number" min="0" name="reactions" value="${values.reactions ?? ""}"></label>
        <label class="field">Your rating<select name="rating"><option value="">–</option>${[1, 2, 3, 4, 5].map((n) => html`<option ${p.rating === n ? "selected" : ""}>${n}</option>`)}</select></label>
      </div>
      <label class="field">What would you change next time? (optional)<input type="text" name="note" value="${p.note || ""}"></label>
      <button class="btn primary small metrics-save" type="submit" style="align-self:flex-start">Save Day ${day} numbers</button>
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
  const day7Saves = counted.map((p) => dayMetric(p, 7, "saves"));
  const nDay7Saves = day7Saves.filter((x) => typeof x === "number").length;
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
      <div class="stat"><div class="label">Day-7 saves, median</div><div class="value">${nDay7Saves >= 3 ? median(day7Saves) : "–"}</div><div class="small muted">${nDay7Saves < 3 ? `${nDay7Saves}/3 day-7 results recorded` : `n = ${nDay7Saves}`}</div></div>
      <div class="stat"><div class="label">Missing numbers</div><div class="value">${missing}</div></div>
    </div>
    <section class="card" aria-labelledby="t" style="padding:10px 10px 4px">
      <div class="row between" style="margin:10px 12px 6px"><h2 id="t">Posts</h2>
        ${nHistory ? html`<a class="small" href="#/posts?author=${ctx.author}${showHistory ? "" : "&history=1"}">${showHistory ? "Hide" : "Show"} earlier history (${nHistory})</a>` : ""}</div>
      ${posts.length ? html`<div class="table-wrap"><table>
        <thead><tr><th>Week</th><th>Story</th><th>Goal · strategy · shape</th><th>Status</th><th class="num">Rating</th><th class="num">Saves · D2 / D7</th><th></th></tr></thead>
        <tbody>${posts.map((p) => html`<tr>
          <td class="mono">${p.week}${isHistory(p) ? html`<div class="small muted">history</div>` : ""}</td>
          <td>${p.first_line || p.headline}${p.url ? html` · <a href="${p.url}" target="_blank" rel="noopener">post</a>` : ""}</td>
          <td>${p.goal || "–"}<div class="small muted">${[p.move, p.format].filter(Boolean).join(" · ")}</div></td>
          <td><span class="chip ${p.status === "posted" || p.status === "measured" ? "ok" : ""}">${p.status}</span></td>
          <td class="num">${p.rating ?? "–"}</td><td class="num">${savesCell(p, usual, measured)}</td>
          <td>${p.archived_run ? html`<a class="btn small" href="#/runs?author=${ctx.author}&week=${p.week}&run=${p.archived_run}">Saved package</a>` : html`<button class="btn small add" data-week="${p.week}">${p.metrics?.d2 || p.metrics?.d7 ? "Edit" : "Add numbers"}</button>`}</td></tr>
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
  $$(".metrics-form", root).forEach((form) => {
    form.querySelectorAll('input[name="day"]').forEach((radio) => radio.addEventListener("change", () => {
      if (!radio.checked) return;
      const values = JSON.parse(form.dataset[`day${radio.value}`] || "{}");
      for (const name of ["impressions", "saves", "comments", "reactions"]) form.elements[name].value = values[name] ?? "";
      form.querySelector(".metrics-save").textContent = `Save Day ${radio.value} numbers`;
    }));
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const fields = new FormData(form);
      const data = { day: Number(fields.get("day")) };
      for (const key of ["impressions", "saves", "comments", "reactions"]) if (fields.get(key) !== "") data[key] = Number.parseInt(fields.get(key), 10);
      if (fields.get("rating")) data.rating = Number(fields.get("rating"));
      if (fields.get("note")) data.note = fields.get("note");
      const post = posts.find((row) => row.week === form.dataset.week && !row.archived_run);
      await withSaving(form.querySelector("button"), () => ctx.data.decide(ctx.author, form.dataset.week, "metrics", data, post?.package_id || null), "Numbers saved to the repository");
      toast("The post and dashboard update after the engine records these numbers.");
      ctx.refresh();
    });
  });
  ctx.watch(() => ctx.data.memory(ctx.author), mem);
}
