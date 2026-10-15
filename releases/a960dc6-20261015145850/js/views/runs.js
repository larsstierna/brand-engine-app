import { html, niceDate, copyText } from "../util.js";
import { pageHead, empty, renderInto } from "../ui.js";
import { progressSteps } from "../progress.js";
import { opinionCards } from "./opinion.js";

async function savedPackage(ctx, root, id) {
  const week = await ctx.data.week(ctx.author, ctx.week, id);
  const record = await week.get("run.json");
  if (!record) throw new Error("This saved package was not found");
  const selected = ctx.params.get("step");
  const step = selected ? progressSteps(week).find((item) => item.id === selected) : null;
  const visibleFiles = { strategy: [], discovered: [], picked: [], research: [11], researched: [11], drafted: [1, 8, 9, 10], approved: [1, 6, 7], ready: [0, 2, 3, 4, 5, 6, 7], posted: [], measured: [] };
  const show = (index) => !step || visibleFiles[step.id].includes(index);
  const files = ["ready/post.txt", "draft/post.md", "ready/first-comment.txt", "ready/replies.txt", "ready/check.txt", "ready/card-alt.txt", "ready/NEEDS-REVIEW.txt", "ready/UNREVIEWED.txt", "draft/lint.txt", "draft/ledger.txt", "draft/chain-log.json", "research/chain-log.json"];
  const contents = await Promise.all(files.map((file) => week.txt(file)));
  const image = await ctx.backend.readBlobURL(`${week.path}/ready/card.png`).catch(() => null);
  const postRecord = await week.get("post-record.json");
  const evidence = await week.get("evidence/sources.json", []);
  const sources = [...new Map([...evidence, ...(week.candidates?.candidates || []).flatMap((card) => card.sources || [])]
    .filter((source) => source.url).map((source) => [source.url, source])).values()];
  const titles = ["Ready post", "Draft", "First comment", "Reply kit", "Final check", "Image alt text", "Review warnings", "Approval status", "Draft lint checks", "Claim ledger", "Writing steps", "Research steps"];
  renderInto(root, html`
    ${pageHead({ title: "Saved package", sub: `${ctx.week} · saved ${niceDate(record.at)} · ${record.stage}`,
      back: { href: `#/runs?author=${ctx.author}&week=${ctx.week}`, label: "Runs" },
      right: html`<a class="btn" href="#/week?author=${ctx.author}&week=${ctx.week}">Open active package</a>` })}
    <p class="notice info">Read-only snapshot, saved before restarting ${record.from_step}. Changes to the active package do not change this copy.</p>
    ${step ? html`<section class="saved-step stack-s"><h2>${step.name}</h2><p>${step.choice || "No choice or output was recorded for this step."}</p><p class="small muted">${[step.actor, step.at ? niceDate(step.at) : ""].filter(Boolean).join(" · ")}</p><a class="small" href="#/runs?author=${ctx.author}&week=${ctx.week}&run=${id}">View full saved package</a></section>` : ""}
    ${week.brief && (!step || ["research", "researched"].includes(step.id)) ? html`<section class="run-document stack"><h2>Research brief</h2><p>${week.brief.story}</p><p class="muted">${week.brief.limits}</p>${opinionCards(week, evidence, { readOnly: true })}</section>` : ""}
    ${contents.some(Boolean) || week.candidates ? "" : empty("No content had been generated", "The package's decisions and timeline are preserved below.")}
    ${contents.map((text, index) => text && show(index) ? html`<section class="run-document"><div class="row between"><h2>${titles[index]}</h2>${index === 0 ? html`<button class="btn small" id="copy-saved-post">Copy post</button>` : ""}</div><pre>${text.trim()}</pre></section>` : "")}
    ${image && (!step || step.id === "ready") ? html`<section class="run-document stack"><h2>Saved image</h2><img class="card-img" src="${image}" alt="${(contents[5] || "Saved package image").trim()}"><a class="btn small" style="align-self:flex-start" href="${image}" download="${ctx.week}-${id.slice(0, 8)}.png">Download image</a></section>` : ""}
    ${week.candidates && (!step || ["discovered", "picked"].includes(step.id)) ? html`<section class="run-document stack"><h2>Story cards</h2>${(week.candidates.candidates || []).map((card) => html`<article class="stack-s"><h3>${card.headline || card.id}</h3><p>${card.summary || card.angle || ""}</p></article>`)}</section>` : ""}
    ${sources.length ? html`<section class="run-document stack"><h2>Saved sources</h2>${sources.map((source) => html`<p><a href="${/^https?:\/\//i.test(source.url) ? source.url : "#"}" target="_blank" rel="noopener">${source.publisher || source.title || source.url}</a></p>`)}</section>` : ""}
    <details class="run-document"><summary>Original decision records</summary><pre class="box">${JSON.stringify(week.decisions, null, 2)}</pre></details>
    <section class="run-document"><h2>Timeline</h2>${week.state.history?.length ? html`<ol class="run-timeline">${week.state.history.map((event) => html`<li><strong>${event.stage}</strong> · ${niceDate(event.at)} · ${event.by || "not recorded"}${event.note ? html`<div class="small muted">${event.note}</div>` : ""}</li>`)}</ol>` : html`<p class="muted">No stage events were recorded before this snapshot.</p>`}</section>
    ${postRecord ? html`<section class="run-document"><h2>Publishing record</h2><pre>${JSON.stringify(postRecord, null, 2)}</pre></section>` : ""}
  `);
  root.querySelector("#copy-saved-post")?.addEventListener("click", () => copyText(contents[0].trim()));
}

export default async function view(ctx, root) {
  const selected = ctx.params.get("week") || "";
  if (selected && !/^\d{4}-W\d{2}$/.test(selected)) throw new Error("Invalid week");
  const id = ctx.params.get("run");
  if (id) return savedPackage(ctx, root, id);
  const groups = await ctx.data.packageRuns(ctx.author, selected);
  const total = groups.reduce((count, group) => count + group.runs.length, 0);
  renderInto(root, html`
    ${pageHead({ title: "Runs", sub: `${total} saved package${total === 1 ? "" : "s"}${selected ? ` for ${selected}` : ""}.`,
      right: html`<div class="row">${selected ? html`<a class="btn small" href="#/runs?author=${ctx.author}">All weeks</a>` : ""}<button class="btn small" id="refresh-runs">Refresh</button></div>` })}
    ${groups.length ? groups.map((group) => html`<section class="stack" aria-label="Packages for ${group.week}"><h2>${group.week}</h2>
      <article class="run-entry"><div class="stack-s"><h3>Active package</h3><p class="small muted">${group.state?.stage || "new"}${group.package ? ` · opened ${niceDate(group.package.created_at)} from ${group.package.from_step}` : " · original package"}</p></div><a class="btn small" href="#/week?author=${ctx.author}&week=${group.week}">Open package</a></article>
      ${[...group.runs].reverse().map((run) => html`<article class="run-entry"><div class="stack-s"><h3>${run.title || `Package before ${run.from_step}`}</h3><p class="small muted">${niceDate(run.at)} · ${run.stage} · restarted from ${run.from_step}</p></div><a class="btn small" href="#/runs?author=${ctx.author}&week=${group.week}&run=${run.id}">View saved package</a></article>`)}
      ${group.runs.length ? "" : html`<p class="small muted">No saved runs yet. Starting a new package from This week saves the current one here.</p>`}</section>`)
      : empty("No weekly packages yet", "Packages appear here after the first week is started.", html`<a class="btn" href="#/week?author=${ctx.author}">This week</a>`)}
  `);
  root.querySelector("#refresh-runs").addEventListener("click", () => ctx.refresh());
  ctx.watch(() => ctx.data.packageRuns(ctx.author, selected), groups);
}