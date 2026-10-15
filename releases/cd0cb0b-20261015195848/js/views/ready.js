// Gate 3: the final package to paste into LinkedIn, then "mark as posted".

import { $, $$, html, today, copyText, toast } from "../util.js";
import { pageHead, weekEyebrow, empty, withSaving, renderInto } from "../ui.js";
import { retainedResults } from "../progress.js";
import { confirmButton } from "../motion.js";

export default async function view(ctx, root) {
  const wk = await ctx.data.week(ctx.author, ctx.week);
  const activity = await ctx.data.activity(ctx.author, ctx.week);
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
  const reminder = (days) => {
    const date = new Date(`${posted?.posted_at?.slice(0, 10)}T12:00:00Z`);
    if (Number.isNaN(+date)) return "date unavailable";
    date.setUTCDate(date.getUTCDate() + days);
    return date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
  };

  renderInto(root, html`
    ${pageHead({ eyebrow: weekEyebrow(ctx.week), title: retained ? "Earlier saved package" : posted ? "Posted" : "Ready to post", back,
      sub: posted ? `Recorded ${posted.posted_at || "without a date"}. Number requests: ${reminder(2)} and ${reminder(7)}.` : `You post this yourself. Suggested time: ${ctx.authorCfg.schedule?.posting_time || "a weekday morning"}.`,
      right: posted ? html`<a class="btn primary small" href="#/posts?author=${ctx.author}&rate=${ctx.week}">Add numbers</a>` : "" })}
    ${unreviewed || needs ? html`<section class="notice warn ready-review" aria-label="Review warnings"><h2>${posted ? "Review notes" : "Review before posting"}</h2>${unreviewed ? html`<p>${posted ? "This package was prepared without your review." : "This draft was not approved before the deadline. Read it carefully before posting."}</p>` : ""}${needs ? html`<details><summary>Checks that need your review</summary><p>${needs}</p></details>` : ""}</section>` : ""}
    <div class="split">
      <div class="main stack">
        <section class="card stack-s">
          <div class="row between"><h2>Post text</h2><button class="btn primary small" data-copy="post">Copy post</button></div>
          <pre class="box" style="font-family:var(--font);font-size:15px">${post.trim()}</pre>
        </section>
        ${img ? html`<section class="card row" style="gap:18px;align-items:flex-start">
          <img class="card-img" src="${img}" alt="${(alt || "").trim()}">
          <div class="stack-s" style="flex:1 1 220px;min-width:0">
            <h2>Image</h2>
            <p class="small muted">1080 × 1350, in your style. Add the alt text in LinkedIn so screen readers can describe it.</p>
            <div class="row">${img ? html`<a class="btn small" href="${img}" download="${ctx.week}-${ctx.author}-card.png">Download image</a>` : ""}
              ${alt ? html`<button class="btn small" data-copy="alt">Copy alt text</button>` : ""}</div>
          </div>
        </section>` : html`<p class="small muted">No image is included in this package.</p>`}
        ${comment ? html`<section class="card stack-s"><div class="row between"><h2>First comment</h2><button class="btn small" data-copy="comment">Copy comment</button></div>
          <pre class="box">${comment.trim()}</pre></section>` : ""}
      </div>
      <aside class="side stack">
        <section class="card focus stack-s" aria-labelledby="after">
          <h2 id="after">${posted ? "Posting details" : "After posting"}</h2>
          <label class="field">Link to your post<input id="url" type="url" placeholder="https://www.linkedin.com/posts/…" value="${posted?.url || ""}"></label>
          <label class="field">Posted on<input id="date" type="date" value="${posted?.posted_at || today()}"></label>
          <button class="btn primary" id="mark" ${retained ? "disabled" : ""}>${posted ? "Update" : "Mark as posted"}</button>
        </section>
        ${replies ? html`<section class="card stack-s"><h2>Reply kit · first hour</h2><pre class="box">${replies.trim()}</pre></section>` : ""}
        ${check ? html`<details class="card"><summary>60-second check</summary><pre class="box">${check.trim()}</pre></details>` : ""}
      </aside>
    </div>
  `);

  const texts = { post: post.trim(), comment: (comment || "").trim(), alt: (alt || "").trim() };
  ctx.watch(async () => ({ week: await ctx.data.week(ctx.author, ctx.week), activity: await ctx.data.activity(ctx.author, ctx.week) }), { week: wk, activity });
  $$("[data-copy]", root).forEach((button) => button.addEventListener("click", async (event) => {
    const copied = await copyText(texts[button.dataset.copy]);
    if (copied && event.detail > 0) confirmButton(button);
  }));
  $("#mark", root).addEventListener("click", async (e) => {
    const url = $("#url", root).value.trim();
    if (url && !url.startsWith("https://")) { toast("The link should start with https://", "bad"); return; }
    await withSaving(e.currentTarget, () => ctx.data.decide(ctx.author, ctx.week, "posted", { url, posted_at: $("#date", root).value }, wk.package?.id || null), "Marked as posted");
    ctx.refresh();
  });
  root.addEventListener("input", () => ctx.setDirty(true));
}
