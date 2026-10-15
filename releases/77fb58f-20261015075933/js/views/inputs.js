// Your inputs: first-hand notes, reader questions, library items and ideas. The engine uses them when it picks and writes.

import { $, html, niceDate } from "../util.js";
import { pageHead, withSaving, renderInto } from "../ui.js";

const KINDS = [
  { id: "mine", label: "First-hand note", title: "What you saw or heard yourself",
    hint: "The only thing a post may use for “I saw”, “a customer told me”. Write it as you would say it; it is quoted, never embellished.",
    placeholder: "At the trade fair three buyers asked about service contracts before price." },
  { id: "questions", label: "Reader question", title: "Questions people asked you",
    hint: "Questions from colleagues, customers or comments. A good question often becomes the best post.",
    placeholder: "Why do magnetic bearings cost more up front?" },
  { id: "library", label: "Library item", title: "Studies, books and cases worth returning to",
    hint: "Add the link if there is one. The engine fetches and saves it before using any fact from it.",
    placeholder: "Edmondson's 1999 study of psychological safety in hospital teams" },
  { id: "ideas", label: "Idea", title: "Ideas for later",
    hint: "A hunch, an angle, a post you want to write one day. Ideas are hints, never facts.",
    placeholder: "A post comparing how Europe and China talk about energy efficiency" },
];

// Moments: dated events readers care about (inputs/moments.md, a Markdown table). Planning hints, never facts:
// the calendar bends to what is found, and a moment only helps spot a story. The monthly review adds sourced rows.
async function moments(ctx, root, tabs) {
  const path = `authors/${ctx.author}/inputs/moments.md`;
  const md = (await ctx.data.text(path)) || "| When | Moment | Why readers care | Status |\n|---|---|---|---|\n";
  const rows = md.split("\n").filter((l) => /^\|/.test(l.trim()) && !/^\|\s*-/.test(l.trim()))
    .map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
  const [head, ...body] = rows;
  renderInto(root, html`
    ${pageHead({ title: "Your inputs", sub: "Dated events your readers care about: fairs, rule changes, results days. They are hints for discovery, never a fixed plan and never a fact in a post." })}
    ${tabs}
    <section class="card" style="padding:10px">${body.length ? html`<div class="table-wrap"><table><thead><tr>${(head || []).map((h) => html`<th>${h}</th>`)}</tr></thead>
      <tbody>${body.map((r) => html`<tr>${r.map((c) => html`<td class="small">${c}</td>`)}</tr>`)}</tbody></table></div>` : html`<p class="muted small" style="margin:12px">No moments yet.</p>`}</section>
    <details class="card"><summary>Edit the list</summary>
      <p class="small muted">One row per moment: <code>| 2027-01-01 | What happens | Why readers care | Status or source |</code></p>
      <textarea id="md" class="tall mono" style="min-height:260px">${md}</textarea>
      <button class="btn primary" id="save" style="margin-top:10px">Save</button></details>`);
  $("#save", root).addEventListener("click", async (e) => {
    await withSaving(e.currentTarget, () => ctx.data.save([{ path, content: $("#md", root).value.replace(/\s*$/, "\n") }], `app: ${ctx.author} edits moments`), "Saved");
    ctx.refresh();
  });
}

export default async function view(ctx, root) {
  const tabsFor = (current, counts = {}) => html`<nav class="subtabs" role="tablist" aria-label="Kinds of input">${KINDS.map((k) => html`<button role="tab" aria-selected="${k.id === current}" data-k="${k.id}">${k.label}s <span class="muted">${counts[k.id] || ""}</span></button>`)}<button role="tab" aria-selected="${current === "moments"}" data-k="moments">Moments</button></nav>`;
  const bindTabs = () => root.querySelectorAll(".subtabs button").forEach((b) => b.addEventListener("click", () => { location.hash = `#/inputs/${b.dataset.k}?author=${encodeURIComponent(ctx.author)}`; }));
  if (ctx.sub === "moments") { await moments(ctx, root, tabsFor("moments")); bindTabs(); return; }
  const kind = KINDS.find((k) => k.id === ctx.sub) || KINDS[0];
  const lists = await Promise.all(KINDS.map((k) => ctx.data.inputs(ctx.author, k.id, 15).catch(() => [])));
  const isUsed = (item) => !!item.used && item.used !== "false";
  const counts = Object.fromEntries(KINDS.map((k, i) => [k.id, lists[i].filter((item) => !isUsed(item)).length]));
  const items = lists[KINDS.indexOf(kind)];

  renderInto(root, html`
    ${pageHead({ title: "Your inputs", sub: "Material only you have. The engine looks here first when it picks a story and writes the draft. You can also add inputs by replying to any engine email with “mine:”, “question:” or “idea:”." })}
    ${tabsFor(kind.id, counts)}
    <div class="split">
      <section class="card main stack" aria-labelledby="add-h">
        <h2 id="add-h">${kind.title}</h2>
        <p class="small muted">${kind.hint}</p>
        ${kind.id === "library" ? html`<div class="form-grid"><label class="field">Title<input type="text" id="title"></label><label class="field">Link (optional)<input type="url" id="url" placeholder="https://"></label></div>` : ""}
        <label class="field"><span class="sr">Text</span><textarea id="text" rows="4" placeholder="${kind.placeholder}"></textarea></label>
        <button class="btn primary" id="add" style="align-self:flex-start">Add ${kind.label.toLowerCase()}</button>
      </section>
      <aside class="side stack">
        <section class="card stack-s"><h2>How inputs are used</h2>
          <ul class="small" style="margin:0;padding-left:18px;line-height:1.6">
            <li>Unused inputs are shown to discovery, so a story card can build on them.</li>
            <li>When a post uses one, it is marked “used” and stays here for reference.</li>
            <li>Nothing here is posted as is. Facts still need a saved source.</li>
          </ul></section>
      </aside>
    </div>
    <section class="card stack" aria-labelledby="list-h">
      <h2 id="list-h">Recent ${kind.label.toLowerCase()}s</h2>
      ${items.length ? html`<div class="stack-s">${items.map((x) => html`<div class="list-row" style="align-items:flex-start">
        <div style="flex:1;min-width:0">${x.title ? html`<strong>${x.title}</strong><br>` : ""}<span style="white-space:pre-wrap">${x.text}</span>
          ${x.url ? html`<div class="small"><a href="${x.url}" target="_blank" rel="noopener">${x.url}</a></div>` : ""}
          <div class="small muted">${x.date ? niceDate(x.date) : ""} · from ${x.source || "app"}</div></div>
        <span class="chip ${isUsed(x) ? "" : "ok"}">${/^\d{4}-W\d{2}$/.test(x.used || "") ? html`<a href="#/ready?author=${ctx.author}&week=${x.used}">Used in ${x.used}</a>` : isUsed(x) ? "used" : "unused"}</span></div>`)}</div>`
        : html`<p class="muted small">Nothing yet.</p>`}
    </section>`);

  bindTabs();
  root.addEventListener("input", () => ctx.setDirty(true));
  $("#add", root).addEventListener("click", async (e) => {
    const text = $("#text", root).value.trim();
    const title = $("#title", root)?.value.trim() || "";
    const url = $("#url", root)?.value.trim() || "";
    if (text.length < 5 && !title) { $("#text", root).focus(); return; }
    if (url && (!/^https?:\/\//.test(url) || /linkedin\.com|lnkd\.in/i.test(url))) { $("#url", root).setCustomValidity("Use a non-LinkedIn https link"); $("#url", root).reportValidity(); return; }
    await withSaving(e.currentTarget, () => ctx.data.addInput(ctx.author, kind.id, { text: text || title, title, url }), "Added");
    ctx.refresh();
  });
}
