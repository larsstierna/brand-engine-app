// Gate 3: the final package to paste into LinkedIn, then "mark as posted".

import { $, $$, html, today, copyText, toast, niceDate } from "../util.js";
import { pageHead, weekEyebrow, empty, withSaving, renderInto } from "../ui.js";
import { packageControls, bindPackageControls } from "../package-controls.js";
import { retainedResults } from "../progress.js";

export default async function view(ctx, root) {
  const wk = await ctx.data.week(ctx.author, ctx.week);
  const activity = await ctx.data.activity(ctx.author, ctx.week);
  const busy = ["queued", "in_progress", "waiting", "pending"].includes(activity.job?.status);
  const back = { href: `#/week?author=${ctx.author}&week=${ctx.week}`, label: "This week" };
  const [post, comment, alt, replies, check, needs, unreviewed] = await Promise.all(
    ["post.txt", "first-comment.txt", "card-alt.txt", "replies.txt", "check.txt", "NEEDS-REVIEW.txt", "UNREVIEWED.txt"].map((f) => wk.txt(`ready/${f}`)));
  if (!post) {
    renderInto(root, html`${pageHead({ eyebrow: weekEyebrow(ctx.week), title: "Ready to post", back })}
      ${empty("Not ready yet", "The package appears here after you approve the draft.", html`<a class="btn" href="#/draft?author=${ctx.author}&week=${ctx.week}">Open the draft</a>`)}`);
    return;
  }
  const img = await ctx.backend.readBlobURL(`${wk.path}/ready/card.png`).catch(() => null);
  const posted = wk.decisions.posted;
  const retained = retainedResults(wk).ready;
  const library = await ctx.data.moveLibrary();
  const moveById = Object.fromEntries((library.moves || []).map((move) => [move.id, move.name]));
  const strategyDecision = wk.decisions.strategy;
  const storyDecision = wk.decisions.story;
  const draftDecision = wk.decisions.draft;
  const card = (wk.candidates?.candidates || []).find((candidate) => candidate.id === storyDecision?.candidate);
  const actor = (by) => ({ app: "you in the app", email: "you by email", deadline: "the saved deadline default", engine: "the engine" }[by] || by || "not recorded");
  const trace = [];
  if (strategyDecision) {
    const move = strategyDecision.action === "auto" ? (wk.arc?.recommended?.name || "the recommendation") : (moveById[strategyDecision.move] || strategyDecision.move);
    trace.push(`Strategy: ${move} · chosen by ${actor(strategyDecision.by)} · ${strategyDecision.at ? niceDate(strategyDecision.at) : "time not recorded"}`);
  } else trace.push("Strategy: first-week/default strategy; no separate choice was recorded");
  if (storyDecision?.action === "pick") {
    const publishers = (card?.sources || []).slice(0, 3).map((source) => source.publisher).filter(Boolean).join(", ");
    trace.push(`Story: ${card?.rank ? `card ${card.rank}: ` : ""}${card?.headline || storyDecision.candidate}${publishers ? ` · sources: ${publishers}` : ""} · selected by ${actor(storyDecision.by)} · ${storyDecision.at ? niceDate(storyDecision.at) : "time not recorded"}`);
  } else if (storyDecision?.action === "own") trace.push(`Story: author-provided · selected by ${actor(storyDecision.by)} · ${storyDecision.at ? niceDate(storyDecision.at) : "time not recorded"}`);
  else if (storyDecision?.action) trace.push(`Story: ${storyDecision.action} · recorded by ${actor(storyDecision.by)} · ${storyDecision.at ? niceDate(storyDecision.at) : "time not recorded"}`);
  if (draftDecision) {
    const result = { approve: "approved", edit: "author-edited and approved", change: "change requested" }[draftDecision.action] || "decision recorded";
    trace.push(`Draft: ${result} · ${actor(draftDecision.by)} · ${draftDecision.at ? niceDate(draftDecision.at) : "time not recorded"}`);
  }
  const stages = { discovered: "Story cards prepared", picked: "Story selected", drafted: "Draft checked", revising: "Revision started", approved: "Draft approved", ready: "Package assembled" };
  for (const event of wk.state.history || []) if (stages[event.stage]) trace.push(`${stages[event.stage]} · ${actor(event.by)} · ${event.at ? niceDate(event.at) : "time not recorded"}`);
  const reminder = (days) => {
    const date = new Date(`${posted?.posted_at?.slice(0, 10)}T12:00:00Z`);
    if (Number.isNaN(+date)) return "date unavailable";
    date.setUTCDate(date.getUTCDate() + days);
    return date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
  };

  renderInto(root, html`
    ${pageHead({ eyebrow: weekEyebrow(ctx.week), title: retained ? "Earlier saved package" : "Ready to post", back,
      sub: `Best time for your readers: ${ctx.authorCfg.schedule?.posting_time || "a weekday morning"}.`,
      right: posted ? html`<span class="pill ok">Posted ${posted.posted_at || ""}</span>` : "" })}
    ${unreviewed ? html`<div class="notice warn">This draft was not approved before the deadline. Read it carefully before posting.</div>` : ""}
    ${retained ? html`<div class="notice warn">This is the earlier saved package, not a confirmed result of your latest choice. Recording a new post is disabled while the new step is pending.</div>` : ""}
    ${needs ? html`<div class="notice warn">${needs}</div>` : ""}
    ${posted ? html`<div class="notice ok">Posted ${posted.posted_at}. Numbers are due ${reminder(2)} and ${reminder(7)}. <a href="#/posts?author=${ctx.author}&rate=${ctx.week}">Add numbers</a></div>` : ""}
    ${trace.length ? html`<details class="package-trace" open><summary>How this package came together</summary><ol>${trace.map((item) => html`<li>${item}</li>`)}</ol></details>` : ""}
    ${packageControls(ctx, wk, { busy, job: activity.job })}
    <div class="split">
      <div class="main stack">
        <section class="card stack-s">
          <div class="row between"><h2>1 · Post text</h2><button class="btn primary small" data-copy="post">Copy post</button></div>
          <p class="small muted">${ctx.authorCfg.schedule?.posting_time || "Post when your readers are active."}</p>
          <pre class="box" style="font-family:var(--font);font-size:15px">${post.trim()}</pre>
        </section>
        <section class="card row" style="gap:18px;align-items:flex-start">
          ${img ? html`<img class="card-img" src="${img}" alt="${(alt || "").trim()}">` : html`<div class="card-img" role="img" aria-label="No image this week"></div>`}
          <div class="stack-s" style="flex:1 1 220px;min-width:0">
            <h2>2 · Image</h2>
            <p class="small muted">1080 × 1350, in your style. Add the alt text in LinkedIn so screen readers can describe it.</p>
            <div class="row">${img ? html`<a class="btn small" href="${img}" download="${ctx.week}-${ctx.author}-card.png">Download image</a>` : ""}
              ${alt ? html`<button class="btn small" data-copy="alt">Copy alt text</button>` : ""}</div>
          </div>
        </section>
        ${comment ? html`<section class="card stack-s"><div class="row between"><h2>3 · First comment</h2><button class="btn small" data-copy="comment">Copy comment</button></div>
          <pre class="box">${comment.trim()}</pre></section>` : ""}
      </div>
      <aside class="side stack">
        <section class="card focus stack-s" aria-labelledby="after">
          <h2 id="after">4 · After posting</h2>
          <label class="field">Link to your post<input id="url" type="url" placeholder="https://www.linkedin.com/posts/…" value="${posted?.url || ""}"></label>
          <label class="field">Posted on<input id="date" type="date" value="${posted?.posted_at || today()}"></label>
          <button class="btn primary" id="mark" ${retained ? "disabled" : ""}>${posted ? "Update" : "Mark as posted"}</button>
          <p class="small muted">The engine never posts for you. It will ask for your numbers on day 2 and day 7.</p>
        </section>
        ${replies ? html`<section class="card stack-s"><h2>Reply kit · first hour</h2><pre class="box">${replies.trim()}</pre></section>` : ""}
        ${check ? html`<details class="card"><summary>60-second check</summary><pre class="box">${check.trim()}</pre></details>` : ""}
      </aside>
    </div>
  `);

  const texts = { post: post.trim(), comment: (comment || "").trim(), alt: (alt || "").trim() };
  bindPackageControls(ctx, root, wk);
  ctx.watch(async () => ({ week: await ctx.data.week(ctx.author, ctx.week), activity: await ctx.data.activity(ctx.author, ctx.week) }), { week: wk, activity });
  $$("[data-copy]", root).forEach((b) => b.addEventListener("click", () => copyText(texts[b.dataset.copy])));
  $("#mark", root).addEventListener("click", async (e) => {
    const url = $("#url", root).value.trim();
    if (url && !url.startsWith("https://")) { toast("The link should start with https://", "bad"); return; }
    await withSaving(e.currentTarget, () => ctx.data.decide(ctx.author, ctx.week, "posted", { url, posted_at: $("#date", root).value }, wk.package?.id || null), "Marked as posted");
    ctx.refresh();
  });
  root.addEventListener("input", () => ctx.setDirty(true));
}
