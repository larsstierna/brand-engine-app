// Reasoning-chain editor: one strategy's steps as an editable list (reorder, rename, remove, optional, add a toolbox step or
// a custom one). Used under Brand > Post strategies and in the onboarding plan step. Data shapes: docs/FILE_FORMATS.md
// (brand/chains.yaml). A step is either a toolbox id from library/steps.yaml or a custom {id, label, purpose, needs, phase}.

import { $, $$, html, slug } from "./util.js";

const NEEDS = { search: "searches the web or feeds", source: "needs a saved source", mine: "needs your own note", note: "reasoning" };

// Full step objects for display: toolbox fields, then the chain entry's overrides.
export function fullSteps(entries, box) {
  return (entries || []).map((e) => {
    const d = typeof e === "string" ? { id: e } : e;
    const base = box[d.id];
    return { id: d.id, label: d.label || base?.label || d.id, purpose: d.purpose || base?.purpose || "", phase: d.phase || base?.phase || "draft",
      needs: d.needs || base?.needs || "note", required: d.required !== false, custom: !base, comment: d.comment || "" };
  });
}

function stepRow(s, i) {
  return html`<li class="chain-step card flat" data-id="${s.id}" data-custom="${s.custom ? "1" : ""}" data-phase="${s.phase}" data-needs="${s.needs}">
    <div class="row between" style="gap:8px;align-items:flex-start">
      <span class="chain-num mono" aria-hidden="true">${i + 1}</span>
      <div class="stack-s" style="flex:1 1 260px;min-width:0">
        <input type="text" class="cs-label" aria-label="Step name" value="${s.label}">
        ${s.custom ? html`<textarea class="cs-purpose" rows="2" aria-label="What this step does" placeholder="What should this step find or check?">${s.purpose}</textarea>
          <label class="small row" style="gap:6px">Works from <select class="cs-needs" aria-label="Works from">${Object.entries(NEEDS).map(([k, v]) => html`<option value="${k}" ${s.needs === k ? "selected" : ""}>${v}</option>`)}</select>
            <select class="cs-phase" aria-label="When"><option value="draft" ${s.phase === "draft" ? "selected" : ""}>while writing</option><option value="discover" ${s.phase === "discover" ? "selected" : ""}>while finding stories</option></select></label>`
          : html`<p class="small muted" style="margin:0">${s.purpose}</p>`}
        <span class="small muted">${s.phase === "discover" ? "While finding stories" : "While writing"} · ${NEEDS[s.needs] || s.needs}${s.custom ? " · your own step" : ""}</span>
      </div>
      <div class="row" style="gap:4px">
        <label class="small row" style="gap:4px" title="A required step must run every time; the draft shows it if it could not"><input type="checkbox" class="cs-req" ${s.required ? "checked" : ""}> required</label>
        <button type="button" class="btn small cs-up" aria-label="Move up" ${i === 0 ? "disabled" : ""}>↑</button>
        <button type="button" class="btn small cs-down" aria-label="Move down">↓</button>
        <button type="button" class="btn small danger cs-rm" aria-label="Remove step">✕</button>
      </div>
    </div></li>`;
}

export function chainEditor(moveId, steps, box, { comment = false, commentText = "" } = {}) {
  const used = new Set(steps.map((s) => s.id));
  const options = Object.values(box).filter((s) => !used.has(s.id));
  return html`<div class="chain-editor stack-s" data-move="${moveId}">
    <ol class="chain-list stack-s" style="list-style:none;margin:0;padding:0">${steps.map(stepRow)}</ol>
    <div class="row" style="gap:8px">
      <select class="cs-add-select" aria-label="Add a step from the toolbox"><option value="">Add a step from the toolbox…</option>
        ${options.map((s) => html`<option value="${s.id}">${s.label}</option>`)}</select>
      <button type="button" class="btn small cs-add">Add</button>
      <button type="button" class="btn small cs-add-custom">+ Write your own step</button>
    </div>
    ${comment ? html`<label class="field"><span class="hint">Anything else Claude should change in this chain? (optional)</span>
      <textarea class="cs-comment" rows="2" placeholder="Add a step that checks whether this connects to a regulation change">${commentText}</textarea></label>` : ""}
  </div>`;
}

function renumber(list) {
  $$(".chain-step", list).forEach((li, i) => {
    $(".chain-num", li).textContent = String(i + 1);
    $(".cs-up", li).disabled = i === 0;
  });
}

// Bind every .chain-editor inside root. box: toolbox by id.
export function bindChainEditors(root, box) {
  root.addEventListener("click", (e) => {
    const t = e.target;
    const ed = t.closest(".chain-editor");
    if (!ed) return;
    const list = $(".chain-list", ed);
    const li = t.closest(".chain-step");
    if (t.classList.contains("cs-rm")) { li.remove(); renumber(list); }
    if (t.classList.contains("cs-up") && li.previousElementSibling) { list.insertBefore(li, li.previousElementSibling); renumber(list); }
    if (t.classList.contains("cs-down") && li.nextElementSibling) { list.insertBefore(li.nextElementSibling, li); renumber(list); }
    if (t.classList.contains("cs-add")) {
      const sel = $(".cs-add-select", ed);
      const id = sel.value;
      if (!id || $(`.chain-step[data-id="${id}"]`, list)) return;
      list.insertAdjacentHTML("beforeend", String(stepRow(fullSteps([id], box)[0], list.children.length)));
      sel.querySelector(`option[value="${id}"]`)?.remove();
      sel.value = "";
      renumber(list);
    }
    if (t.classList.contains("cs-add-custom")) {
      list.insertAdjacentHTML("beforeend", String(stepRow({ id: "", label: "", purpose: "", phase: "draft", needs: "source", required: true, custom: true }, list.children.length)));
      renumber(list);
      $(".chain-step:last-child .cs-label", list)?.focus();
    }
  });
}

// Read one editor back into chains.yaml entries. Toolbox steps are kept short (an id, plus only what changed).
export function readChain(ed, box) {
  const used = new Set();
  const steps = [];
  for (const li of $$(".chain-step", ed)) {
    const label = $(".cs-label", li).value.trim();
    const required = $(".cs-req", li).checked;
    if (li.dataset.custom) {
      if (!label) continue;
      let id = li.dataset.id || slug(label);
      while (used.has(id) || box[id]) id += "-x";
      used.add(id);
      const purpose = $(".cs-purpose", li).value.trim() || label;
      steps.push({ id, label, purpose, needs: $(".cs-needs", li).value, phase: $(".cs-phase", li).value, ...(required ? {} : { required: false }) });
      continue;
    }
    const id = li.dataset.id;
    used.add(id);
    const base = box[id] || {};
    const o = { id };
    if (label && label !== base.label) o.label = label;
    if (!required) o.required = false;
    steps.push(Object.keys(o).length === 1 ? id : o);
  }
  return steps;
}

export function readComment(ed) {
  return ($(".cs-comment", ed)?.value || "").trim();
}

// A compact read-only view of a chain (draft page, onboarding summary).
export function chainSummary(steps) {
  return html`<ol class="small" style="margin:0;padding-left:18px">${steps.map((s) => html`<li>${s.label}${s.custom ? html` <span class="chip" style="padding:0 6px;font-size:11px">your step</span>` : ""}${s.required ? "" : html` <span class="muted">(optional)</span>`}</li>`)}</ol>`;
}
