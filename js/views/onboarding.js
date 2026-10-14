// Onboarding from the CV, in four stages (files in authors/<id>/onboarding/):
//   1. You answer a few questions and upload your CV            -> answers.json + cv.*      (starts the analysis)
//   2. Claude analyses: strengths, gaps, questions, a proposal   -> analysis.json
//   3. You confirm, on three screens: what Claude found (and what to do with past chapters), how you want to sound (your
//      post strategies), and your brand (destination, goals, topics, lenses, facts) -> followup.json (starts the plan)
//   4. Claude plans how it will reason for you, one chain of steps per strategy          -> plan.json
//   5. You edit the steps, comment (Claude revises, at most twice) and confirm            -> plan-review.json
//   6. Scripts write exactly what you confirmed; Claude drafts voice, glossary and sources  -> built.json
// Existing authors (Lars, Alice) use the same flow to recalibrate from a new CV: step 4 then creates proposals to approve.
//   #/onboarding/new                       a new author
//   #/onboarding?author=<id>               that author's current stage
//   #/onboarding?author=<id>&mode=recalibrate   start a recalibration from a new CV

import { $, $$, html, slug, toast } from "../util.js";
import { pageHead, withSaving, renderInto, engineNote } from "../ui.js";
import { chainEditor, bindChainEditors, fullSteps, readChain, readComment } from "../chain-editor.js";

// Same rule as engine/onboarding.py moves_from_voice: primary 60, secondary 30, 10 shared by "occasionally".
export function movesFromVoice({ primary, secondary, occasional = [] }) {
  if (!primary) return [];
  let p = 60, s2 = 30;
  if (!secondary) { p += s2; s2 = 0; }
  const occ = [...new Set(occasional)].filter((m) => m !== primary && m !== secondary);
  const out = [{ id: primary, weight: p }, ...(secondary ? [{ id: secondary, weight: s2 }] : [])];
  if (occ.length) return [...out, ...occ.map((id) => ({ id, weight: Math.max(1, Math.round(10 / occ.length)) }))];
  const pw = Math.round(p + (10 * p) / (p + s2));
  return [{ id: primary, weight: pw }, ...(secondary ? [{ id: secondary, weight: 100 - pw }] : [])];
}
const USES = [["none", "Not at all", "Never in a post, a topic or your profile"], ["background", "As background", "At most one line; never a topic"], ["core", "As a core theme", "Part of what you write about"]];

const DRAFT_KEY = "brand-engine-onboarding";
const STEPS = ["You", "Your CV", "Where you want to go", "Topics and boundaries", "Voice", "Your week"];
const DAYS = [["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]];
const CV_TYPES = { "application/pdf": "pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx", "text/plain": "txt", "text/markdown": "md" };
const CV_MAX = 5 * 1024 * 1024;
const TARGET = {
  mine: "becomes a first-hand note: the only source for “I saw…” in your posts",
  question: "becomes a reader question for future posts", idea: "saved as a post idea", no_go: "added to your boundaries",
  voice: "shapes your voice guide", readers: "shapes who you write for", lens: "shapes your angles", general: "context for your brand",
};
const lines = (t) => String(t || "").split("\n").map((x) => x.trim()).filter(Boolean);
const csv = (t) => String(t || "").split(",").map((x) => x.trim()).filter(Boolean);

const blank = () => ({
  step: 0, display_name: "", id: "", idTouched: false, email: "", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Stockholm",
  employer: "", role: "", cv_text: "", destination: "", readers: [{ role: "", wants: "" }], why_me: "", success: "",
  topics: "", no_go: "", boundaries: "", samples: ["", ""], words_used: "", words_avoided: "", language: "", style: "clean",
  strategy_prompt: { day: "sat", time: "18:00" }, strategy_by: { day: "sun", time: "12:00" },
  discover: { day: "sun", time: "18:00" }, pick_by: { day: "mon", time: "12:00" }, approve_by: { day: "tue", time: "07:00" },
});
const loadDraft = () => { try { return { ...blank(), ...JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}") }; } catch { return blank(); } };
const keepDraft = (s) => { try { const { cvFile, ...rest } = s; localStorage.setItem(DRAFT_KEY, JSON.stringify(rest)); } catch { /* fine: lives for this visit */ } };
const dropDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* nothing to drop */ } };

function setPath(obj, path, value) {
  const keys = path.split(".");
  let o = obj;
  keys.slice(0, -1).forEach((k) => { o = o[k]; });
  o[keys.at(-1)] = value;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(new Error("Could not read the file"));
    r.readAsDataURL(file);
  });
}

function cvExt(file) {
  const byName = (file.name.split(".").pop() || "").toLowerCase();
  return CV_TYPES[file.type] || (["pdf", "docx", "txt", "md"].includes(byName) ? byName : null);
}

// Files to write for stage 1: the CV (and removal of an older CV or stale later stages), answers.json.
async function stageOneFiles(ctx, id, answers, file) {
  const base = `authors/${id}/onboarding`;
  const existing = (await ctx.backend.list(base).catch(() => [])).map((f) => f.name);
  const files = [];
  if (file) {
    const ext = cvExt(file);
    files.push({ path: `${base}/cv.${ext}`, content: await fileToBase64(file), encoding: "base64" });
    existing.filter((n) => /^cv\.(pdf|docx|txt|md)$/.test(n) && n !== `cv.${ext}`).forEach((n) => files.push({ path: `${base}/${n}`, delete: true }));
  }
  ["analysis.json", "followup.json", "plan.json", "plan-review.json", "built.json"].filter((n) => existing.includes(n)).forEach((n) => files.push({ path: `${base}/${n}`, delete: true }));
  files.push({ path: `${base}/answers.json`, content: JSON.stringify(answers, null, 2) + "\n" });
  return files;
}

function cvField(s) {
  return html`<div class="stack-s">
    <label class="field">Your CV (PDF, Word, or text; up to 5 MB)
      <input type="file" id="cv-file" accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain">
      <span class="hint" id="cv-name">${s.cvFile ? `Selected: ${s.cvFile.name}` : "Stored only in your private repository. Claude reads it to suggest your brand; nothing from it is used in a post until you confirm it."}</span></label>
    <details ${s.cv_text ? "open" : ""}><summary class="small">No file at hand, or a scanned PDF? Paste the text instead</summary>
      <textarea data-k="cv_text" rows="8" placeholder="Paste your CV or LinkedIn experience section here">${s.cv_text}</textarea></details>
  </div>`;
}

// ------------------------------------------------------------------------------------------------ stage 1: new author
function stepHtml(s) {
  const dayTime = (key, label) => html`<label class="field">${label}<span class="row"><select data-k="${key}.day" aria-label="${label} day">${DAYS.map(([v, n]) => html`<option value="${v}" ${s[key].day === v ? "selected" : ""}>${n}</option>`)}</select>
    <input type="time" data-k="${key}.time" value="${s[key].time}" aria-label="${label} time"></span></label>`;
  switch (s.step) {
    case 0: return html`
      <p class="lead">Four short steps, then Claude reads your CV and comes back with what it found, a few questions, and a proposed brand for you to confirm or change.</p>
      <div class="form-grid">
        <label class="field">Your name<input type="text" data-k="display_name" value="${s.display_name}" autocomplete="name"></label>
        <label class="field">Short id<input type="text" data-k="id" value="${s.id}" pattern="[a-z][a-z0-9-]+"><span class="hint">Lower-case, used for your folder, e.g. “alice”.</span></label>
        <label class="field">Email for the weekly mails<input type="email" data-k="email" value="${s.email}" autocomplete="email"></label>
        <label class="field">Time zone<input type="text" data-k="timezone" value="${s.timezone}"></label>
        <label class="field">Employer (optional)<input type="text" data-k="employer" value="${s.employer}"><span class="hint">For disclosure lines and boundaries, never as a topic.</span></label>
        <label class="field">Your role today<input type="text" data-k="role" value="${s.role}" placeholder="HR business partner for a sales organisation"></label>
      </div>`;
    case 1: return html`
      <p class="lead">Your CV is the starting point. Claude looks for the angle only you have, the evidence behind it, and the gaps between where you are and where you want to go.</p>
      ${cvField(s)}`;
    case 2: return html`
      <p class="lead">In your own words. Rough is fine: Claude will propose a sharper version for you to approve.</p>
      <label class="field">In a year, who should know you for what?<textarea data-k="destination" rows="3" placeholder="The HR voice managers in Nordic industry trust for practical, evidence-based people leadership.">${s.destination}</textarea></label>
      <fieldset class="stack-s"><legend>Who do you want to reach, and what do they want from a post? (optional)</legend>
        ${s.readers.map((r, i) => html`<div class="form-grid"><input type="text" data-k="readers.${i}.role" aria-label="Reader ${i + 1}" placeholder="People managers" value="${r.role}">
          <input type="text" data-k="readers.${i}.wants" aria-label="What reader ${i + 1} wants" placeholder="Something to try with their team this week" value="${r.wants}"></div>`)}
        <button class="btn small" type="button" data-act="add-reader" style="align-self:flex-start">+ Add a reader</button></fieldset>
      <label class="field">What would success look like? (optional)<input type="text" data-k="success" value="${s.success}" placeholder="Managers save my posts and ask me about them"></label>`;
    case 3: return html`
      <p class="lead">Only what you already know. Claude proposes topics from your CV; here you set limits.</p>
      <label class="field">Topics you want to be known for (optional, one per line)<textarea data-k="topics" rows="3">${s.topics}</textarea></label>
      <label class="field">Never post about (one per line)<textarea data-k="no_go" rows="3" placeholder="My employer's internal matters">${s.no_go}</textarea></label>
      <label class="field">Other boundaries (one per line)<span class="hint">For example: no customer names, no politics.</span><textarea data-k="boundaries" rows="3">${s.boundaries}</textarea></label>`;
    case 4: return html`
      <p class="lead">Paste one to three things you wrote and liked: posts, emails, a talk. They teach the engine your rhythm, never their facts. Optional, but it helps a lot.</p>
      ${s.samples.map((x, i) => html`<label class="field">Sample ${i + 1}<textarea data-k="samples.${i}" rows="5">${x}</textarea></label>`)}
      ${s.samples.length < 3 ? html`<button class="btn small" type="button" data-act="add-sample" style="align-self:flex-start">+ Add a sample</button>` : ""}
      <div class="form-grid">
        <label class="field">Words you like to use<input type="text" data-k="words_used" value="${s.words_used}"></label>
        <label class="field">Words you never want to see<input type="text" data-k="words_avoided" value="${s.words_avoided}" placeholder="game-changer, synergy"></label>
        <label class="field">Language level of your readers<input type="text" data-k="language" value="${s.language}" placeholder="International English, plain words"></label>
        <label class="field">Image style<select data-k="style"><option value="clean" ${s.style === "clean" ? "selected" : ""}>Clean (geometric)</option><option value="warm" ${s.style === "warm" ? "selected" : ""}>Warm (editorial)</option></select></label>
      </div>`;
    default: return html`
      <p class="lead">When should the engine ask you? Each step takes a few minutes, from the email or this app.</p>
      <div class="form-grid">${dayTime("strategy_prompt", "Which strategy this week? (question arrives)")}${dayTime("strategy_by", "Choose the strategy by")}
        ${dayTime("discover", "Story cards arrive")}${dayTime("pick_by", "Pick a story by")}${dayTime("approve_by", "Approve the draft by")}</div>
      <div class="notice info small">Next: Claude analyses your CV and answers (about 5 minutes). You get an email, then you answer a few questions and confirm your brand. Nothing is used before you confirm it.</div>`;
  }
}

function stepProblems(s, taken) {
  const p = [];
  if (s.step === 0) {
    if (!s.display_name.trim()) p.push("Write your name");
    if (!/^[a-z][a-z0-9-]+$/.test(s.id)) p.push("The id needs lower-case letters, digits or dashes");
    if (taken.includes(s.id)) p.push(`The id “${s.id}” is taken`);
    if (s.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.email)) p.push("The email looks wrong");
  }
  if (s.step === 1 && !s.cvFile && s.cv_text.trim().length < 200) p.push("Add your CV file, or paste its text");
  if (s.step === 2 && s.destination.trim().length < 15) p.push("Write where you want to go in a sentence");
  return p;
}

function bindCv(root, s, rerender) {
  $("#cv-file", root)?.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!cvExt(f)) { toast("Use a PDF, Word (.docx), .txt or .md file", "bad"); e.target.value = ""; return; }
    if (f.size > CV_MAX) { toast("The file is larger than 5 MB", "bad"); e.target.value = ""; return; }
    s.cvFile = f;
    $("#cv-name", root).textContent = `Selected: ${f.name} (${Math.round(f.size / 1024)} KB)`;
    rerender?.();
  });
}

async function newAuthor(ctx, root) {
  const taken = ctx.authors.map((a) => a.id);
  const s = loadDraft();
  const draw = () => {
    renderInto(root, html`
      ${pageHead({ eyebrow: `New author · step ${s.step + 1} of ${STEPS.length}`, title: STEPS[s.step] })}
      <ol class="stepper" aria-label="Onboarding steps">${STEPS.map((n, i) => html`<li class="${i < s.step ? "done" : i === s.step ? "now" : ""}"><div class="bar"></div><span class="name">${n}</span></li>`)}</ol>
      <section class="card stack" id="step">${stepHtml(s)}</section>
      <div class="savebar"><button class="btn" id="back" ${s.step === 0 ? "disabled" : ""}>Back</button>
        <button class="btn primary" id="next">${s.step === STEPS.length - 1 ? "Send to analysis" : "Next"}</button>
        <span class="small muted">Answers are kept on this device until you send them.</span></div>`);
    const step = $("#step", root);
    bindCv(step, s);
    step.addEventListener("input", (e) => {
      const k = e.target.dataset.k;
      if (!k) return;
      setPath(s, k, e.target.value);
      if (k === "id") s.idTouched = true;
      if (k === "display_name" && !s.idTouched) { s.id = slug(e.target.value.split(" ")[0] || ""); const el = $('[data-k="id"]', step); if (el) el.value = s.id; }
      keepDraft(s);
    });
    step.addEventListener("change", (e) => { if (e.target.dataset.k) { setPath(s, e.target.dataset.k, e.target.value); keepDraft(s); } });
    step.addEventListener("click", (e) => {
      const act = e.target.dataset.act;
      if (!act) return;
      if (act === "add-reader") s.readers.push({ role: "", wants: "" });
      if (act === "add-sample") s.samples.push("");
      keepDraft(s); draw();
    });
    $("#back", root).addEventListener("click", () => { s.step--; keepDraft(s); draw(); });
    $("#next", root).addEventListener("click", async (e) => {
      const p = stepProblems(s, taken);
      if (p.length) { toast(p.join(". "), "bad"); return; }
      if (s.step < STEPS.length - 1) { s.step++; keepDraft(s); draw(); window.scrollTo(0, 0); return; }
      if (!s.cvFile && s.cv_text.trim().length < 200) { s.step = 1; draw(); toast("Add your CV first", "bad"); return; }
      await withSaving(e.currentTarget, () => submitNew(ctx, s), "Sent. Claude is analysing your CV…");
      dropDraft();
      await ctx.reloadAuthors();
      location.hash = `#/onboarding?author=${encodeURIComponent(s.id)}`;
    });
  };
  draw();
}

async function submitNew(ctx, s) {
  const author = {
    display_name: s.display_name.trim(), first_name: s.display_name.trim().split(" ")[0], email: s.email.trim(), email_also: [],
    owner: false, enabled: true, employer: s.employer.trim(), timezone: s.timezone.trim() || "Europe/Stockholm",
    schedule: { strategy_gate: true, strategy_prompt: s.strategy_prompt, strategy_by: s.strategy_by, discover: s.discover, pick_by: s.pick_by, approve_by: s.approve_by, posting_time: "" },
    defaults: { no_pick: "top_card", no_approval: "send_unreviewed" },
    scoring: { brand_fit: 40, move_fit: 20, significance: 25, angle: 20, freshness: 15 }, candidates: 4,
    language: { level: s.language.trim() || "International English, plain words" }, monthly_review: true,
  };
  const answers = {
    mode: "new", created: new Date().toISOString(), by: "app",
    cv: s.cvFile ? { file: `cv.${cvExt(s.cvFile)}`, name: s.cvFile.name, size: s.cvFile.size } : null,
    cv_text: s.cvFile ? "" : s.cv_text.trim(),
    role: s.role.trim(), employer: s.employer.trim(), destination: s.destination.trim(),
    readers: s.readers.filter((r) => r.role.trim()), success: s.success.trim(),
    topics: lines(s.topics), no_go: lines(s.no_go), boundaries: lines(s.boundaries),
    voice: { samples: s.samples.map((x) => x.trim()).filter(Boolean), words_used: csv(s.words_used), words_avoided: csv(s.words_avoided), language: s.language.trim() },
    visual: { style: s.style },
  };
  const files = await stageOneFiles(ctx, s.id, answers, s.cvFile);
  files.unshift({ path: `authors/${s.id}/author.yaml`, content: ctx.data.dumpYaml(author, `# ${author.first_name}'s settings. Edit in the app (Brand and strategy > Schedule). Field guide: docs/FILE_FORMATS.md\n`) });
  return ctx.data.save(files, `app: onboard ${s.id} (CV and answers)`);
}

// --------------------------------------------------------------------------------- stage 1: recalibrate (existing author)
async function recalibrate(ctx, root, id) {
  const [brand, cfg] = await Promise.all([ctx.data.brand(id), ctx.data.author(id)]);
  const s = { cvFile: null, cv_text: "" };
  renderInto(root, html`
    ${pageHead({ eyebrow: cfg.display_name || id, title: "Recalibrate from your CV", back: { href: `#/brand/overview?author=${id}`, label: "Brand and strategy" },
      sub: "Claude compares your CV and answers with your current brand. Every suggested change comes back as a proposal you approve or reject; nothing changes before that." })}
    <section class="card stack">${cvField(s)}</section>
    <section class="card stack">
      <label class="field">What has changed since you set up your brand?<textarea id="change" rows="3" placeholder="New role, new market, a topic you want to move into or away from"></textarea></label>
      <label class="field">Where do you want to go now? (leave empty to keep it)<span class="hint">Today: ${brand.strategy.destination || "not set"}</span>
        <textarea id="dest" rows="2"></textarea></label>
      <label class="field">Anything to stop or avoid? (one per line)<textarea id="stop" rows="2"></textarea></label>
    </section>
    <div class="savebar"><button class="btn primary" id="send">Send to analysis</button></div>`);
  bindCv(root, s);
  $("#send", root).addEventListener("click", async (e) => {
    s.cv_text = ($('[data-k="cv_text"]', root)?.value || "").trim();
    if (!s.cvFile && s.cv_text.length < 200) { toast("Add your CV file, or paste its text", "bad"); return; }
    const answers = {
      mode: "recalibrate", created: new Date().toISOString(), by: "app",
      cv: s.cvFile ? { file: `cv.${cvExt(s.cvFile)}`, name: s.cvFile.name, size: s.cvFile.size } : null, cv_text: s.cvFile ? "" : s.cv_text,
      change_note: $("#change", root).value.trim(), destination: $("#dest", root).value.trim(), no_go: lines($("#stop", root).value),
    };
    await withSaving(e.currentTarget, async () => ctx.data.save(await stageOneFiles(ctx, id, answers, s.cvFile), `app: ${id} recalibration (CV)`),
      "Sent. Claude is analysing your CV…");
    ctx.data.invalidate(`authors/${id}/onboarding`);
    location.hash = `#/onboarding?author=${encodeURIComponent(id)}`;
  });
}

// ------------------------------------------------------------------------------------- stage 3: the follow-up review
function goalRow(g) {
  return html`<div class="card flat stack-s fu-goal" data-id="${g.id || ""}">
    <label class="field">Question a post can answer<textarea class="g-q" rows="2">${g.question || ""}</textarea></label>
    ${g.reason ? html`<p class="small muted">Why: ${g.reason}${g.today != null ? ` · today: weight ${g.today}` : ""}</p>` : g.today != null ? html`<p class="small muted">Today: weight ${g.today}</p>` : ""}
    <div class="row between"><label class="row small" style="gap:8px">Weight <input type="range" min="1" max="60" class="g-w" value="${g.weight || 15}" aria-label="Weight"><span class="mono g-wv">${g.weight || 15}</span><span class="muted g-share"></span></label>
      <button class="btn small danger rm" type="button" data-rm=".fu-goal">Remove</button></div></div>`;
}
function topicRow(t, kind) {
  return html`<div class="list-row fu-topic" data-kind="${kind}"><div class="form-grid"><input type="text" class="t-name" aria-label="Topic" value="${t.name || ""}" placeholder="Topic">
    <input type="text" class="t-kw" aria-label="Keywords" value="${(t.keywords || []).join(", ")}" placeholder="keywords, comma separated"></div>
    <button class="btn small danger rm" type="button" data-rm=".fu-topic">Remove</button></div>`;
}
function readerRow(r) {
  return html`<div class="list-row fu-reader"><div class="form-grid"><input type="text" class="r-role" aria-label="Reader" value="${r.role || ""}" placeholder="Role">
    <input type="text" class="r-wants" aria-label="What they want" value="${r.wants || ""}" placeholder="What they want from a post"></div>
    <button class="btn small danger rm" type="button" data-rm=".fu-reader">Remove</button></div>`;
}

async function followUp(ctx, root, id, ob) {
  const an = ob.analysis || {};
  const p = an.proposals || {};
  const lib = (await ctx.data.moveLibrary()).moves || [];
  const proposedMoves = Object.fromEntries((p.moves || []).map((m) => [m.id, m]));
  const recal = ob.mode === "recalibrate";
  const noGo = [...new Set([...(p.no_go || []), ...(ob.answers?.no_go || [])])];
  // Recalibration: show what the brand holds today next to each suggestion.
  const now = recal ? await ctx.data.brand(id) : null;
  const nowGoals = Object.fromEntries((now?.goals.goals || []).map((g) => [g.id, g]));
  const nowMoves = Object.fromEntries((now?.moves.moves || []).map((m) => [m.id, m.weight]));
  const today = (text) => (recal && text ? html`<span class="hint">Today: ${text}</span>` : "");
  const fit = an.strategy_fit || {};
  const ranked = [...(p.moves || [])].sort((a, b) => (b.weight || 0) - (a.weight || 0)).map((m) => m.id);
  const prevVoice = ob.followup?.voice || {};
  const voice = { primary: prevVoice.primary || ranked[0] || "", secondary: prevVoice.secondary ?? ranked[1] ?? "", occasional: prevVoice.occasional || ranked.slice(2) };
  const SCREENS = ["What Claude found", "How you want to sound", "Your brand"];
  renderInto(root, html`<div class="stack" id="fu">
    ${pageHead({ eyebrow: recal ? "Recalibration · your answers" : "New author · confirm your brand", title: "What Claude found, and what it suggests",
      sub: recal ? "Three short screens. When you send them, Claude plans how it will reason for you; every difference from your current brand then becomes a proposal you approve."
        : "Three short screens. When you send them, Claude plans how it will reason for you each week; you check that plan before anything is built." })}
    <ol class="stepper" aria-label="Screens">${SCREENS.map((n, i) => html`<li class="${i === 0 ? "now" : ""}" data-screen-tab="${i}"><div class="bar"></div><span class="name">${i + 1}. ${n}</span></li>`)}</ol>
    <div class="fu-screen stack" data-screen="0">
    <section class="card stack" aria-labelledby="found"><h2 id="found">What your CV shows</h2>
      <p class="lead">${an.summary || ""}</p>
      <div class="grid-2">
        <div class="stack-s"><h3>Strengths, with evidence</h3><ul class="small" style="margin:0;padding-left:18px">${(an.strengths || []).map((x) => html`<li><strong>${x.text || x}</strong>${x.evidence ? html` <span class="muted">· ${x.evidence}</span>` : ""}</li>`)}</ul>
          ${(an.angles || []).length ? html`<h3 style="margin-top:10px">Your rare angle</h3><ul class="small" style="margin:0;padding-left:18px">${an.angles.map((x) => html`<li>${x}</li>`)}</ul>` : ""}</div>
        <div class="stack-s"><h3>Gaps to close</h3><ul class="small" style="margin:0;padding-left:18px">${(an.gaps || []).map((x) => html`<li><strong>${x.text || x}</strong>${x.why ? html` <span class="muted">· ${x.why}</span>` : ""}</li>`)}</ul></div>
      </div></section>

    ${(an.past_chapters || []).length ? html`<section class="card stack" aria-labelledby="pcs"><h2 id="pcs">Your past chapters</h2>
      <p class="small muted">Experience that does not point where you want to go. Your brand is built on your destination, so these stay in the background unless you say otherwise.</p>
      ${an.past_chapters.map((c) => html`<fieldset class="card flat stack-s fu-chapter" data-id="${c.id}"><legend><strong>${c.text}</strong></legend>
        ${c.why ? html`<p class="small muted" style="margin:0">${c.why}</p>` : ""}
        <div class="row" role="radiogroup" aria-label="How to use ${c.text}">${USES.map(([v, label, hint]) => html`<label class="row small" style="gap:6px" title="${hint}">
          <input type="radio" name="pc-${c.id}" value="${v}" ${(ob.followup?.past_chapters?.[c.id] || "background") === v ? "checked" : ""}> ${label}</label>`)}</div></fieldset>`)}
    </section>` : ""}
    <section class="card stack" aria-labelledby="qs"><h2 id="qs">A few questions</h2>
      <p class="small muted">Your answers are used where it says. Skip any you prefer not to answer.</p>
      ${(an.questions || []).map((q) => html`<label class="field fu-q" data-id="${q.id}">${q.question}
        <span class="hint">${q.why ? `${q.why} · ` : ""}Your answer ${TARGET[q.target] || "is used as context"}.</span>
        <textarea rows="3" class="q-a">${ob.followup?.answers?.[q.id] || ""}</textarea></label>`)}
    </section>

    </div>
    <div class="fu-screen stack" data-screen="1" hidden>
    <section class="card stack" aria-labelledby="snd"><h2 id="snd">How do you want to sound?</h2>
      <p class="small muted">Each strategy is a way of thinking and writing. Read how it feels and the short example, then choose the one that sounds most like you, or like who you want to become. Most writers blend two. Claude's view of the fit is next to each; it is only a suggestion.</p>
      <div class="grid-2">${lib.map((m) => html`<div class="card move-card voice-card" data-id="${m.id}">
        <div class="row between"><strong>${m.name}</strong><span class="small muted">like ${m.known_example}</span></div>
        <p class="small" style="margin:0">${m.feels_like || m.idea}</p>
        ${m.example ? html`<blockquote class="small muted" style="margin:0;padding-left:10px;border-left:3px solid var(--line)">${m.example}</blockquote>` : ""}
        ${fit[m.id] ? html`<p class="small" style="margin:0"><strong>Claude:</strong> ${fit[m.id]}</p>` : ""}
        ${recal && nowMoves[m.id] != null ? html`<p class="small muted" style="margin:0">Today: weight ${nowMoves[m.id]}</p>` : ""}
        <div class="row small" role="group" aria-label="${m.name}" style="gap:12px">
          <label class="row" style="gap:5px"><input type="radio" name="v-primary" value="${m.id}" ${voice.primary === m.id ? "checked" : ""}> Most like me</label>
          <label class="row" style="gap:5px"><input type="radio" name="v-secondary" value="${m.id}" ${voice.secondary === m.id ? "checked" : ""}> Second</label>
          <label class="row" style="gap:5px"><input type="checkbox" class="v-occ" value="${m.id}" ${voice.occasional.includes(m.id) ? "checked" : ""}> Now and then</label></div>
      </div>`)}</div>
      <label class="row small" style="gap:6px"><input type="radio" name="v-secondary" value="" ${!voice.secondary ? "checked" : ""}> No second strategy</label>
      <p class="small" id="v-mix" role="status"></p>
    </section>
    </div>
    <div class="fu-screen stack" data-screen="2" hidden>
    <section class="card stack" aria-labelledby="dst"><h2 id="dst">Destination</h2>
      <label class="field">Who should know you for what?${today(now?.strategy.destination)}<textarea id="destination" rows="3">${p.destination || ""}</textarea></label>
      <label class="field">Why you?<span class="hint">The vantage point only you have. Used to choose angles, never quoted as a credential.</span><textarea id="why_me" rows="2">${p.why_me || ""}</textarea></label>
      <fieldset class="stack-s"><legend>Readers</legend><div id="readers" class="stack-s">${(p.readers || []).map(readerRow)}</div>
        <button class="btn small add" type="button" data-add="readers" style="align-self:flex-start">+ Add a reader</button></fieldset>
    </section>

    <section class="card stack" aria-labelledby="gls"><h2 id="gls">Brand goals</h2>
      <p class="small muted">Questions your posts answer for readers. The engine favours the goal furthest behind its weight.</p>
      ${recal ? html`<p class="small muted">Today: ${(now?.goals.goals || []).map((g) => `${g.id} ${g.weight}`).join(" · ")}</p>` : ""}
      <div id="goals" class="stack">${(p.goals || []).map((g) => goalRow({ ...g, today: nowGoals[g.id]?.weight }))}</div>
      <button class="btn small add" type="button" data-add="goals" style="align-self:flex-start">+ Add a goal</button></section>

    <section class="card stack" aria-labelledby="tps"><h2 id="tps">Topics</h2>
      <h3>Primary (1 to 3)</h3><div id="primary" class="stack-s">${((p.topics || {}).primary || []).map((t) => topicRow(t, "primary"))}</div>
      <button class="btn small add" type="button" data-add="primary" style="align-self:flex-start">+ Add</button>
      <h3>Secondary</h3><div id="secondary" class="stack-s">${((p.topics || {}).secondary || []).map((t) => topicRow(t, "secondary"))}</div>
      <button class="btn small add" type="button" data-add="secondary" style="align-self:flex-start">+ Add</button></section>

    <section class="card stack" aria-labelledby="lns"><h2 id="lns">Lenses</h2>
      <p class="small muted">The angles only you would take. Untick any that are not you.</p>
      ${(p.lenses || []).map((l) => html`<div class="card flat stack-s fu-lens" data-id="${l.id || ""}">
        <label class="row"><input type="checkbox" class="l-on" checked> <strong>Use this lens</strong></label>
        <div class="form-grid"><label class="field">Name<input type="text" class="l-title" value="${l.title || ""}"></label>
          <label class="field">Use it when<input type="text" class="l-when" value="${l.applies_when || ""}"></label></div>
        <label class="field">What you notice first<input type="text" class="l-first" value="${l.notices_first || ""}"></label>
        ${l.reason ? html`<p class="small muted">Why: ${l.reason}</p>` : ""}
        <input type="hidden" class="l-extra" value="${JSON.stringify({ words_used: l.words_used || [], words_avoided: l.words_avoided || [], anchors: l.anchors || [] })}"></div>`)}
    </section>

    <section class="card stack" aria-labelledby="fcts"><h2 id="fcts">Facts posts may mention about you</h2>
      <p class="small muted">Tick only what is true AND fine to see in public. Unticked facts are never used. You can add more later under Profile.</p>
      ${(an.profile_facts || []).map((f) => html`<label class="row fu-fact" style="align-items:flex-start;gap:10px" data-source="${f.source || "cv"}">
        <input type="checkbox" class="f-on" style="margin-top:4px"><span><span class="f-text">${f.text}</span><br><span class="small muted">From your ${f.source === "answers" ? "answers" : "CV"}${f.where ? `: ${f.where}` : ""}</span></span></label>`)}
    </section>

    <section class="card stack" aria-labelledby="bnd"><h2 id="bnd">Never post about</h2>
      <label class="field"><span class="hint">One per line.</span><textarea id="no_go" rows="4">${noGo.join("\n")}</textarea></label></section>

    </div>
    <div class="savebar"><button class="btn" id="prev" disabled>Back</button><button class="btn primary" id="next">Next</button>
      <button class="btn primary" id="send" hidden>Send: plan how to reason for me</button>
      <span class="small muted" id="fu-hint">Nothing is used until you confirm the plan.</span></div></div>`);
  const box = $("#fu", root);
  let screen = 0;
  const show = (i) => {
    screen = i;
    $$(".fu-screen", box).forEach((el) => { el.hidden = Number(el.dataset.screen) !== i; });
    $$("[data-screen-tab]", box).forEach((li) => { const n = Number(li.dataset.screenTab); li.className = n < i ? "done" : n === i ? "now" : ""; });
    $("#prev", box).disabled = i === 0;
    $("#next", box).hidden = i === SCREENS.length - 1;
    $("#send", box).hidden = i !== SCREENS.length - 1;
    window.scrollTo(0, 0);
  };
  const readVoice = () => ({
    primary: $('input[name="v-primary"]:checked', box)?.value || "",
    secondary: $('input[name="v-secondary"]:checked', box)?.value || "",
    occasional: $$(".v-occ:checked", box).map((x) => x.value),
  });
  const libName = Object.fromEntries(lib.map((m) => [m.id, m.name]));
  const mix = () => {
    const v = readVoice();
    const mv = movesFromVoice({ ...v, secondary: v.secondary === v.primary ? "" : v.secondary });
    $("#v-mix", box).textContent = mv.length ? `Your mix: ${mv.map((m) => `${libName[m.id]} ${m.weight}%`).join(" · ")}. You can fine-tune it later under Brand and strategy.` : "Choose the strategy that sounds most like you.";
    $$(".voice-card", box).forEach((c) => c.classList.toggle("on", mv.some((m) => m.id === c.dataset.id)));
  };
  mix();
  box.addEventListener("change", (e) => { if (e.target.name === "v-primary" || e.target.name === "v-secondary" || e.target.classList.contains("v-occ")) mix(); });
  $("#prev", box).addEventListener("click", () => show(Math.max(0, screen - 1)));
  $("#next", box).addEventListener("click", () => {
    if (screen === 1) {
      const v = readVoice();
      if (!v.primary) { toast("Choose the strategy that sounds most like you", "bad"); return; }
      if (v.secondary && v.secondary === v.primary) { toast("Choose a different second strategy, or none", "bad"); return; }
    }
    show(Math.min(SCREENS.length - 1, screen + 1));
  });

  const shares = () => {
    const all = $$(".fu-goal", box);
    const total = all.reduce((a, g) => a + Number($(".g-w", g).value), 0) || 1;
    all.forEach((g) => { $(".g-wv", g).textContent = $(".g-w", g).value; $(".g-share", g).textContent = `(${Math.round((Number($(".g-w", g).value) / total) * 100)}% of posts)`; });
  };
  shares();
  box.addEventListener("input", (e) => { if (e.target.classList.contains("g-w")) shares(); });
  box.addEventListener("click", (e) => {
    const t = e.target;
    if (t.dataset.rm) { t.closest(t.dataset.rm)?.remove(); shares(); }
    const add = t.dataset.add;
    if (add === "readers") $("#readers", box).insertAdjacentHTML("beforeend", String(readerRow({})));
    if (add === "goals") { $("#goals", box).insertAdjacentHTML("beforeend", String(goalRow({ weight: 15 }))); shares(); }
    if (add === "primary" || add === "secondary") $(`#${add}`, box).insertAdjacentHTML("beforeend", String(topicRow({}, add)));
  });

  $("#send", box).addEventListener("click", async (e) => {
    const used = new Set();
    const goals = $$(".fu-goal", box).map((g) => {
      const question = $(".g-q", g).value.trim();
      let gid = g.dataset.id || slug(question.replace(/^(does|can|is|do)\s+(he|she|they|i)\s+/i, "")).slice(0, 30) || "goal";
      while (used.has(gid)) gid += "-2";
      used.add(gid);
      return { id: gid, question, weight: Number($(".g-w", g).value) };
    }).filter((g) => g.question);
    const topics = (kind) => $$(`.fu-topic[data-kind="${kind}"]`, box).map((r) => ({ name: $(".t-name", r).value.trim(), keywords: csv($(".t-kw", r).value) })).filter((t) => t.name);
    const voicePick = readVoice();
    const moves = movesFromVoice(voicePick);
    const lenses = $$(".fu-lens", box).filter((l) => $(".l-on", l).checked).map((l) => ({
      id: l.dataset.id || slug($(".l-title", l).value), title: $(".l-title", l).value.trim(), applies_when: $(".l-when", l).value.trim(),
      notices_first: $(".l-first", l).value.trim(), ...JSON.parse($(".l-extra", l).value || "{}"),
    })).filter((l) => l.title);
    const followup = {
      created: new Date().toISOString(), by: "app",
      answers: Object.fromEntries($$(".fu-q", box).map((q) => [q.dataset.id, $(".q-a", q).value.trim()]).filter(([, v]) => v)),
      destination: $("#destination", box).value.trim(), why_me: $("#why_me", box).value.trim(),
      readers: $$(".fu-reader", box).map((r) => ({ role: $(".r-role", r).value.trim(), wants: $(".r-wants", r).value.trim() })).filter((r) => r.role),
      goals, topics: { primary: topics("primary"), secondary: topics("secondary") }, voice: voicePick, moves, lenses, no_go: lines($("#no_go", box).value),
      past_chapters: Object.fromEntries($$(".fu-chapter", box).map((c) => [c.dataset.id, $(`input[name="pc-${c.dataset.id}"]:checked`, c)?.value || "background"])),
      profile_facts_confirmed: $$(".fu-fact", box).filter((f) => $(".f-on", f).checked).map((f) => ({ text: $(".f-text", f).textContent.trim(), source: f.dataset.source })),
    };
    const problems = [];
    if (followup.destination.length < 15) problems.push("Write your destination");
    if (goals.length < 2) problems.push("Keep at least 2 goals");
    if (!moves.length) problems.push("Choose the strategy that sounds most like you (screen 2)");
    if (!followup.topics.primary.length) problems.push("Keep at least one primary topic");
    if (followup.topics.primary.length > 3) problems.push("At most 3 primary topics");
    if (problems.length) { toast(problems.join(". "), "bad"); return; }
    await withSaving(e.currentTarget, () => ctx.data.save([{ path: `authors/${id}/onboarding/followup.json`, content: JSON.stringify(followup, null, 2) + "\n" }],
      `app: ${id} confirms onboarding`), "Sent. Claude is planning how to reason for you…");
    toast(engineNote(ctx.backend));
    ctx.refresh();
  });
}

// ------------------------------------------------------------------------------------------- stage 5: the reasoning plan
async function planView(ctx, root, id, ob) {
  const [libData, box] = await Promise.all([ctx.data.moveLibrary(), ctx.data.toolbox()]);
  const lib = Object.fromEntries((libData.moves || []).map((m) => [m.id, m]));
  const plan = ob.plan || {};
  const round = Number(plan.round || 1);
  const left = Math.max(0, 3 - round);
  const recal = ob.mode === "recalibrate";
  renderInto(root, html`<div class="stack" id="pl">
    ${pageHead({ eyebrow: `${recal ? "Recalibration" : "New author"} · reasoning plan${round > 1 ? ` · revision ${round - 1}` : ""}`, title: "How your posts will be reasoned",
      sub: "For each of your strategies, the steps the engine will follow every week it is used. Edit the steps, add your own, or tell Claude what to change. Nothing is built until you confirm." })}
    <section class="card arc stack-s"><span class="eyebrow">Claude's plan</span><p class="arc-dest" style="margin:0">${plan.summary || ""}</p>
      ${plan.notes ? html`<p class="small" style="margin:0"><strong>Note from Claude:</strong> ${plan.notes}</p>` : ""}</section>
    ${Object.entries(plan.chains || {}).map(([mid, ch]) => html`<section class="card stack" aria-label="${lib[mid]?.name || mid}">
      <div class="row between"><h2>${lib[mid]?.name || mid}</h2><span class="small muted">${(ch.steps || []).length} steps</span></div>
      ${ch.why ? html`<p class="small" style="margin:0">${ch.why}</p>` : ""}
      ${ch.walkthrough ? html`<p class="small muted" style="margin:0;padding-left:10px;border-left:3px solid var(--line)">${ch.walkthrough}</p>` : ""}
      ${chainEditor(mid, fullSteps(ch.steps || [], box), box, { comment: true, commentText: ob.review?.comments?.[mid] || "" })}
    </section>`)}
    <section class="card stack-s"><label class="field">Anything else about how Claude should reason for you? (optional)
      <textarea id="all" rows="2" placeholder="For example: always check whether a story connects to a regulation change">${ob.review?.comments?._all || ""}</textarea></label></section>
    <div class="savebar"><button class="btn primary" id="confirm">Confirm and build my ${recal ? "proposals" : "brand"}</button>
      <button class="btn" id="revise" ${left ? "" : "disabled"}>Ask Claude to revise (${left} left)</button>
      <span class="small muted">${left ? "Your edits are kept; Claude applies your comments." : "No revisions left: edit the steps yourself and confirm."}</span></div></div>`);
  const el = $("#pl", root);
  bindChainEditors(el, box);
  const collect = () => {
    const chains = {}, comments = {};
    $$(".chain-editor", el).forEach((ed) => {
      chains[ed.dataset.move] = { steps: readChain(ed, box) };
      const c = readComment(ed);
      if (c) comments[ed.dataset.move] = c;
    });
    const all = $("#all", el).value.trim();
    if (all) comments._all = all;
    return { chains, comments };
  };
  const save = async (btn, action, msg) => {
    const { chains, comments } = collect();
    if (Object.values(chains).some((c) => c.steps.length < 2)) { toast("Each strategy needs at least two steps", "bad"); return; }
    if (action === "revise" && !Object.keys(comments).length) { toast("Write what Claude should change", "bad"); return; }
    const body = { action, round, chains, comments, by: "app", at: new Date().toISOString() };
    await withSaving(btn, () => ctx.data.save([{ path: `authors/${id}/onboarding/plan-review.json`, content: JSON.stringify(body, null, 2) + "\n" }],
      `app: ${id} ${action === "confirm" ? "confirms" : "comments on"} the reasoning plan`), msg);
    toast(engineNote(ctx.backend));
    ctx.data.invalidate(`authors/${id}/onboarding`);
    ctx.refresh();
  };
  $("#confirm", el).addEventListener("click", (e) => save(e.currentTarget, "confirm", recal ? "Confirmed. Creating your proposals…" : "Confirmed. Building your brand…"));
  $("#revise", el).addEventListener("click", (e) => save(e.currentTarget, "revise", "Sent. Claude is revising the plan…"));
}

// -------------------------------------------------------------------------------------------------- status screens
function status(ctx, root, id, ob) {
  const recal = ob.mode === "recalibrate";
  const s = {
    submitted: ["Claude is reading your CV", "It looks for your strengths and their evidence, the angle only you have, and the gaps to your destination. Then it writes a few questions and a proposed brand. About 5 minutes; you get an email."],
    answered: ["Claude is planning how to reason for you", "For each of your strategies, the steps it will follow every week, with an example. About 5 minutes; you get an email."],
    "plan-revising": ["Claude is revising your plan", "Your edits are kept and your comments applied. About 5 minutes; you get an email."],
    "plan-confirmed": recal ? ["Creating your proposals", "Each difference between what you confirmed and your current brand becomes a proposal. About a minute."]
      : ["Building your brand", "Your confirmed choices and reasoning chains are written word for word. Claude drafts your voice guide, glossary and first sources. About 10 minutes; you get an email."],
  }[ob.stage];
  renderInto(root, html`${pageHead({ eyebrow: recal ? "Recalibration" : "New author", title: s[0] })}
    <section class="card focus stack"><p class="lead">${s[1]}</p>
      ${ctx.backend.kind === "local" ? html`<div class="notice info small">On this computer the Claude steps do not run; they run in GitHub Actions.</div>` : ""}
      <div class="row"><button class="btn primary" id="again">Check again</button><a class="btn" href="#/settings?author=${id}">See runs</a></div></section>`);
  $("#again", root).addEventListener("click", () => { ctx.data.invalidate(`authors/${id}/onboarding`); ctx.refresh(); });
}

function built(ctx, root, id, ob) {
  const recal = ob.mode === "recalibrate";
  const problems = ob.built?.problems || [];
  renderInto(root, html`${pageHead({ eyebrow: recal ? "Recalibration" : "New author", title: recal ? "Your proposals are ready" : "Your brand is set up" })}
    <section class="card stack">
      ${recal ? html`<p class="lead">Approve or reject each proposed change. Approved changes are applied within a minute and logged with the date.</p>
          <a class="btn primary" href="#/brand/reviews?author=${id}" style="align-self:flex-start">Review the proposals</a>`
        : html`<p class="lead">Read your brand files and change anything that is not you. Your first story cards arrive within a few hours.</p>
          ${problems.length ? html`<div class="notice warn small">Some files need a look: ${problems.join("; ")}</div>` : ""}
          <a class="btn primary" href="#/brand/overview?author=${id}" style="align-self:flex-start">Go to Brand and strategy</a>`}
      <a class="small" href="#/onboarding?author=${id}&mode=recalibrate">Start again with a new CV</a></section>`);
}

// ------------------------------------------------------------------------------------------------------------ router
export default async function view(ctx, root) {
  if (!ctx.data) { ctx.go("connect"); return; }
  const id = ctx.params.get("author");
  if (ctx.sub === "new" || !id || !ctx.authors.some((a) => a.id === id)) return newAuthor(ctx, root);
  const ob = await ctx.data.onboarding(id);
  const hasBrand = !!(await ctx.data.text(`authors/${id}/brand/strategy.yaml`));
  if (ctx.params.get("mode") === "recalibrate" && (ob.stage === "none" || ob.stage === "built")) return recalibrate(ctx, root, id);
  if (ob.stage === "none") return hasBrand ? recalibrate(ctx, root, id) : newAuthor(ctx, root);
  if (ob.stage === "analysed") return followUp(ctx, root, id, ob);
  if (ob.stage === "planned") return planView(ctx, root, id, ob);
  if (ob.stage === "built") return built(ctx, root, id, ob);
  return status(ctx, root, id, ob);
}
