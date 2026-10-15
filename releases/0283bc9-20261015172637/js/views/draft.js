// Gate 2: is this true, and is it me? Shows the post with every claim marked and linked to its saved source.

import { $, $$, esc, html, raw, toast } from "../util.js";
import { pageHead, weekEyebrow, empty, withSaving, engineNote, renderInto, weekFlow } from "../ui.js";
import { fullSteps } from "../chain-editor.js";
import { retainedResults } from "../progress.js";

const CHANGES = [
  ["shorter", "Shorter"], ["sharper-opening", "Sharper opening"], ["less-jargon", "Less jargon"],
  ["other-angle", "Other angle"], ["drop-reading", "Drop my reading"], ["more-personal", "Use my own note"], ["warmer", "Warmer"],
  ["softer", "Softer"], ["stronger", "Stronger"],
];

// Mark claims inside the post text (exact substrings), escaping everything else.
export function markClaims(post, claims, sourcesByN) {
  const spans = [];
  for (const c of claims || []) {
    if (!c.text) continue;
    const i = post.indexOf(c.text);
    if (i < 0 || spans.some((s) => i < s.end && i + c.text.length > s.start)) continue;
    spans.push({ start: i, end: i + c.text.length, c });
  }
  spans.sort((a, b) => a.start - b.start);
  let out = "", pos = 0;
  for (const s of spans) {
    out += esc(post.slice(pos, s.start));
    const src = sourcesByN[s.c.source];
    const title = s.c.kind === "opinion" ? "Your opinion; embedded facts still need saved evidence" : s.c.kind === "reading" ? "Your reading (labelled in the post)"
      : s.c.kind === "calculated" ? `Calculated: ${s.c.calc || ""}` : src ? `${src.publisher}, ${src.date || ""}` : "Source";
    out += `<span class="claim ${esc(s.c.kind)}" title="${esc(title)}">${esc(post.slice(s.start, s.end))}${s.c.source ? `<sup>${esc(s.c.source)}</sup>` : ""}</span>`;
    pos = s.end;
  }
  out += esc(post.slice(pos));
  return out.split(/\n\s*\n/).map((p) => `<p>${p}</p>`).join("");
}

export default async function view(ctx, root) {
  const wk = await ctx.data.week(ctx.author, ctx.week);
  const back = { href: `#/week?author=${ctx.author}&week=${ctx.week}`, label: "This week" };
  const post = await wk.txt("draft/post.md");
  if (!post) {
    renderInto(root, html`${pageHead({ eyebrow: weekEyebrow(ctx.week), title: "Your draft", back })}
      ${empty("No draft yet", wk.decisions.story ? "Your story choice is saved. The package status shows whether drafting is waiting, queued or running." : "Pick a story first.",
        html`<a class="btn" href="#/${wk.decisions.story ? "week" : "pick"}?author=${ctx.author}&week=${ctx.week}">${wk.decisions.story ? "Track this package" : "Go to the story cards"}</a>`)}`);
    return;
  }
  const [claims, sources, meta, check, needs, lintTxt, ledgerTxt, chainLog, box, chains, lib, researchLog] = await Promise.all([
    wk.get("draft/claims.json", { claims: [] }), wk.get("evidence/sources.json", []), wk.get("draft/meta.json", {}),
    wk.txt("draft/check.md"), wk.txt("draft/NEEDS-REVIEW.txt"), wk.txt("draft/lint.txt"), wk.txt("draft/ledger.txt"),
    wk.get("draft/chain-log.json"), ctx.data.toolbox(), ctx.data.chains(ctx.author), ctx.data.moveLibrary(),
    wk.get("research/chain-log.json"),
  ]);
  const libMove = (lib.moves || []).find((m) => m.id === meta.move);
  const chain = fullSteps(chains[meta.move]?.steps?.length ? chains[meta.move].steps : (libMove?.steps || []), box, { flow: weekFlow(wk) }).filter((s) => s.phase !== "discover");
  const ran = Object.fromEntries([...(researchLog?.steps || []), ...(chainLog?.steps || [])].map((e) => [e.id, e]));
  const proofText = (e) => (!e ? "" : e.proof?.decision === "opinion" ? "Your chosen opinion" : e.proof?.source ? `source ${e.proof.source}` : e.proof?.input ? e.proof.input : e.proof?.mine ? "your note with the pick" : e.proof?.note || e.why || "");
  const byN = Object.fromEntries((sources || []).map((s) => [String(s.n), s]));
  const dec = wk.decisions.draft;
  const stage = wk.state.stage;
  const retained = retainedResults(wk).draft;
  const editable = !retained && ["drafted", "ready", "approved"].includes(stage);
  const rounds = Math.max(0, 2 - (wk.state.round || 0));
  const name = ctx.authorCfg.display_name || ctx.author;
  const readings = (claims.claims || []).filter((c) => c.kind === "reading");

  renderInto(root, html`
    ${pageHead({ eyebrow: `${weekEyebrow(ctx.week)}${wk.state.round ? ` · revision ${wk.state.round}` : ""}`, title: "Is this true, and is it you?", back,
      right: stage === "drafted" ? html`<span class="pill warn">${wk.package?.manual ? "Needs your review" : `Approve by ${ctx.authorCfg.schedule?.approve_by?.day || ""} ${ctx.authorCfg.schedule?.approve_by?.time || ""}`}</span>`
        : html`<span class="pill accent">${stage}</span>` })}
    ${needs ? html`<div class="notice warn"><strong>The checks flagged this draft.</strong> You can still approve it after reading:<br>${raw(esc(needs).replace(/\n/g, "<br>"))}</div>` : ""}
    ${stage === "revising" ? html`<div class="notice info">Your change request is recorded. The workflow status shows whether revision is waiting, queued or running.</div>` : ""}
    ${retained ? html`<div class="notice warn">Earlier saved draft. It has not been confirmed for your latest choice; approval and editing reopen when the new draft is ready.</div>` : ""}
    ${wk.decisions.opinion?.resolved ? html`<section class="opinion-summary stack-s"><h2>Your chosen opinion</h2><p>${wk.decisions.opinion.resolved.opinion}</p><span class="chip" style="align-self:flex-start">Tone: ${wk.decisions.opinion.resolved.tone}</span></section>` : ""}
    <div class="split">
      <article class="card main stack" aria-label="Post preview">
        <div class="who"><div class="avatar" aria-hidden="true">${name.split(" ").map((x) => x[0]).join("").slice(0, 2)}</div>
          <div><strong>${name}</strong><div class="small muted">Preview · ${post.trim().length} characters</div></div></div>
        <div class="post" id="post">${raw(markClaims(post.trim(), claims.claims, byN))}</div>
        <div class="row small muted"><span><span class="claim">blue</span> sourced claim</span><span><span class="claim reading">violet</span> your reading</span>
          <span>Goal: ${meta.goal || "–"}</span><span>Lens: ${meta.lens || "–"}</span><span>Shape: ${meta.format || "–"}</span></div>
      </article>
      <aside class="side stack">
        <section class="card stack-s" aria-labelledby="dec">
          <h2 id="dec">Your decision</h2>
          ${dec ? html`<p class="small muted">Last decision: ${dec.action} (${dec.by})</p>` : ""}
          <button class="btn primary" id="approve" ${editable ? "" : "disabled"}>Approve</button>
          <button class="btn" id="edit-toggle" ${editable ? "" : "disabled"}>Edit the text myself</button>
          <div id="edit-box" hidden class="stack-s">
            <p class="small muted">Your wording is used as written. Source and voice checks run again; any findings appear in the ready package as warnings and do not block your version.</p>
            <label class="field">Your version<textarea id="edit-text" class="tall" style="font-family:var(--font);font-size:15px">${post.trim()}</textarea></label>
            <span class="small muted" id="edit-count"></span>
            <button class="btn primary" id="save-edit">Approve my version</button>
          </div>
          <div class="small" style="font-weight:600;margin-top:6px">Or ask for a change · ${rounds} round${rounds === 1 ? "" : "s"} left</div>
          <div class="row" role="group" aria-label="Change requests">${CHANGES.filter(([id]) => weekFlow(wk) === 2 || !["softer", "stronger"].includes(id)).map(([id, label]) => html`<button type="button" class="toggle-chip" aria-pressed="false" data-req="${id}">${label}</button>`)}</div>
          <label class="field"><span class="hint">Anything else? (optional)</span><textarea id="note" rows="2"></textarea></label>
          <button class="btn" id="change" ${editable && rounds > 0 ? "" : "disabled"}>Ask for these changes</button>
        </section>
        <section class="card stack-s" aria-labelledby="chk">
          <h2 id="chk">60-second check</h2>
          ${check ? html`<pre class="box">${check}</pre>` : html`<p class="muted small">No check written.</p>`}
          ${readings.length ? html`<div class="small"><strong>Your reading in this post:</strong><ul>${readings.map((r) => html`<li>${r.text}</li>`)}</ul></div>` : ""}
        </section>
        ${chain.length ? html`<section class="card stack-s" aria-labelledby="chn">
          <h2 id="chn">How it was reasoned</h2>
          <p class="small muted">${libMove?.name || meta.move}: the steps of your chain, and what each one found.</p>
          <ol class="small chain-log" style="margin:0;padding-left:18px">${chain.map((s) => {
            const e = ran[s.id];
            const ok = e?.done;
            return html`<li><strong>${s.label}</strong>${s.custom ? html` <span class="chip" style="padding:0 6px;font-size:11px">your step</span>` : ""}
              <span class="chip ${ok ? "ok" : s.required ? "warn" : ""}" style="padding:0 6px;font-size:11px">${ok ? "done" : s.required ? "missing" : "skipped"}</span>
              ${proofText(e) ? html`<div class="muted">${proofText(e)}</div>` : ""}</li>`;
          })}</ol></section>` : ""}
        <section class="card stack-s" aria-labelledby="src">
          <h2 id="src">Saved sources</h2>
          ${(sources || []).length ? html`<ol class="small" style="margin:0;padding-left:18px">${sources.map((s) => html`<li><a href="${s.url}" target="_blank" rel="noopener">${s.publisher}</a>${s.date ? `, ${s.date}` : ""} ${s.tier ? html`<span class="chip" style="padding:1px 7px;font-size:11px">${s.tier}</span>` : ""}</li>`)}</ol>`
            : html`<p class="muted small">No saved sources.</p>`}
        </section>
        ${(() => {
          const rows = (lintTxt || "").split("\n").map((l) => l.match(/^\[(BLOCK|WARN)\] (L\d+) ([^:]+): (.*)$/)).filter(Boolean);
          return rows.length ? html`<section class="card stack-s" aria-labelledby="vr"><h2 id="vr">Voice rules</h2>
            <ul class="small" style="margin:0;padding-left:0;list-style:none">${rows.map(([, lv, id, name, text]) => html`<li style="margin-bottom:6px">
              <span class="chip ${lv === "BLOCK" ? "warn" : ""}" style="padding:0 6px;font-size:11px">${lv === "BLOCK" ? "fix" : "advice"}</span>
              <strong>${name}</strong>: ${text}</li>`)}</ul>
            <a class="small" href="#/brand/voice?author=${ctx.author}">Change your voice rules</a></section>` : "";
        })()}
        <details class="card"><summary>Automatic checks (lint and claim ledger)</summary>
          <pre class="box">${lintTxt || "No lint report."}</pre><pre class="box" style="margin-top:10px">${ledgerTxt || "No ledger report."}</pre></details>
      </aside>
    </div>
  `);

  const after = () => { toast(engineNote(ctx.backend)); ctx.refresh(); };
  $("#approve", root).addEventListener("click", async (e) => { await withSaving(e.currentTarget, () => ctx.data.decide(ctx.author, ctx.week, "draft", { action: "approve" }, wk.package?.id || null), "Approved"); after(); });
  $("#edit-toggle", root).addEventListener("click", () => { $("#edit-box", root).hidden = !$("#edit-box", root).hidden; });
  const count = () => { $("#edit-count", root).textContent = `${$("#edit-text", root).value.trim().length} characters`; };
  $("#edit-text", root).addEventListener("input", count); count();
  $("#save-edit", root).addEventListener("click", async (e) => {
    const text = $("#edit-text", root).value.trim();
    if (text.length < 100) { toast("The post looks too short", "bad"); return; }
    await withSaving(e.currentTarget, () => ctx.data.decide(ctx.author, ctx.week, "draft", { action: "edit", text }, wk.package?.id || null), "Your version is approved");
    after();
  });
  $$(".toggle-chip", root).forEach((b) => b.addEventListener("click", () => b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") === "true" ? "false" : "true")));
  $("#change", root).addEventListener("click", async (e) => {
    const requests = $$(".toggle-chip[aria-pressed='true']", root).map((b) => b.dataset.req);
    const note = $("#note", root).value.trim();
    if (!requests.length && !note) { toast("Choose a change or write a note", "bad"); return; }
    await withSaving(e.currentTarget, () => ctx.data.decide(ctx.author, ctx.week, "draft", { action: "change", requests, note }, wk.package?.id || null), "Change requested");
    after();
  });
  root.addEventListener("input", () => ctx.setDirty(true));
  ctx.watch(() => ctx.data.week(ctx.author, ctx.week), wk);
}
