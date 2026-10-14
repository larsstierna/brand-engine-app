// Gate 3: the final package to paste into LinkedIn, then "mark as posted".

import { $, $$, html, today, copyText, toast } from "../util.js";
import { pageHead, weekEyebrow, empty, withSaving, renderInto } from "../ui.js";

export default async function view(ctx, root) {
  const wk = await ctx.data.week(ctx.author, ctx.week);
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
  const reminder = (days) => {
    const date = new Date(`${posted?.posted_at?.slice(0, 10)}T12:00:00Z`);
    if (Number.isNaN(+date)) return "date unavailable";
    date.setUTCDate(date.getUTCDate() + days);
    return date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
  };

  renderInto(root, html`
    ${pageHead({ eyebrow: weekEyebrow(ctx.week), title: "Ready to post", back,
      sub: `Best time for your readers: ${ctx.authorCfg.schedule?.posting_time || "a weekday morning"}.`,
      right: posted ? html`<span class="pill ok">Posted ${posted.posted_at || ""}</span>` : "" })}
    ${unreviewed ? html`<div class="notice warn">This draft was not approved before the deadline. Read it carefully before posting.</div>` : ""}
    ${needs ? html`<div class="notice warn">${needs}</div>` : ""}
    ${posted ? html`<div class="notice ok">Posted ${posted.posted_at}. Numbers are due ${reminder(2)} and ${reminder(7)}. <a href="#/posts?author=${ctx.author}&rate=${ctx.week}">Add numbers</a></div>` : ""}
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
          <button class="btn primary" id="mark">${posted ? "Update" : "Mark as posted"}</button>
          <p class="small muted">The engine never posts for you. It will ask for your numbers on day 2 and day 7.</p>
        </section>
        ${replies ? html`<section class="card stack-s"><h2>Reply kit · first hour</h2><pre class="box">${replies.trim()}</pre></section>` : ""}
        ${check ? html`<details class="card"><summary>60-second check</summary><pre class="box">${check.trim()}</pre></details>` : ""}
      </aside>
    </div>
  `);

  const texts = { post: post.trim(), comment: (comment || "").trim(), alt: (alt || "").trim() };
  $$("[data-copy]", root).forEach((b) => b.addEventListener("click", () => copyText(texts[b.dataset.copy])));
  $("#mark", root).addEventListener("click", async (e) => {
    const url = $("#url", root).value.trim();
    if (url && !url.startsWith("https://")) { toast("The link should start with https://", "bad"); return; }
    await withSaving(e.currentTarget, () => ctx.data.decide(ctx.author, ctx.week, "posted", { url, posted_at: $("#date", root).value }), "Marked as posted");
    ctx.refresh();
  });
  root.addEventListener("input", () => ctx.setDirty(true));
}
