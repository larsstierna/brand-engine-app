import { html, toast } from "../util.js";
import { pageHead, weekEyebrow, empty, withSaving, renderInto, toneControl, opinionDefault, weekFlow } from "../ui.js";

export function opinionCards(week, sources = [], { readOnly = false } = {}) {
  const byNumber = Object.fromEntries(sources.map((source) => [String(source.n), source]));
  const selected = week.decisions.opinion?.resolved?.option || week.decisions.opinion?.option;
  return html`<div class="opinion-options stack">${(week.opinions?.options || []).map((option, index) => html`<article class="card opinion-card stack ${selected === option.id ? "chosen" : ""}">
    <div class="row"><span class="chip ${option.id === week.opinions.recommended ? "accent" : ""}">${option.id === week.opinions.recommended ? "Recommended · " : ""}${{ with: "With the grain", against: "Against the grain", sideways: "Sideways" }[option.kind] || option.kind}</span><span class="small muted">Option ${index + 1}</span></div>
    <h2>${option.opinion}</h2><ul class="opinion-reasons">${(option.reasons || []).map((reason) => {
      const source = byNumber[String(reason.source)];
      return html`<li>${reason.text} ${source ? html`<a href="${/^https?:\/\//i.test(source.url || "") ? source.url : "#"}" target="_blank" rel="noopener">${source.publisher}</a>` : html`<span class="muted">Source ${reason.source}</span>`}</li>`;
    })}</ul>
    <dl class="opinion-details"><dt>The other side</dt><dd>${option.counter}</dd><dt>Risk</dt><dd>${option.risk}</dd><dt>Suggested tone</dt><dd>${option.suggested_tone}</dd><dt>Earlier position</dt><dd>${option.position}</dd></dl>
    ${readOnly ? "" : html`<button class="btn ${option.id === week.opinions.recommended ? "primary" : ""} choose-opinion" data-option="${option.id}" ${week.decisions.opinion || week.state.stage !== "researched" ? "disabled" : ""}>Use this opinion</button>`}
  </article>`)}</div>`;
}

export default async function view(ctx, root) {
  const [week, rules] = await Promise.all([ctx.data.week(ctx.author, ctx.week), ctx.data.yaml(`authors/${ctx.author}/brand/voice-rules.yaml`, {})]);
  ctx.voiceRules = rules;
  const back = { href: `#/week?author=${ctx.author}&week=${ctx.week}`, label: "This week" };
  const header = pageHead({ title: "Choose your opinion", sub: weekEyebrow(ctx.week), back });
  if (weekFlow(week) !== 2 || !week.opinions?.options?.length) {
    renderInto(root, html`${header}${empty(weekFlow(week) === 1 ? "This package uses the earlier flow" : "Research is not ready yet", weekFlow(week) === 1 ? "Finish this package as before, or start a new package from discovery." : "Your saved story is researched before opinion options are offered.", html`<a class="btn" href="${back.href}">Track this package</a>`)}`);
    return;
  }
  const sources = await week.get("evidence/sources.json", []);
  const defaultChoice = opinionDefault(week, rules);
  const decision = week.decisions.opinion;
  const canChoose = !decision && week.state.stage === "researched";
  const chosen = decision?.resolved || (decision ? { opinion: decision.opinion || week.opinions.options.find((option) => option.id === decision.option)?.opinion || defaultChoice.option?.opinion, tone: decision.tone || defaultChoice.tone } : null);
  renderInto(root, html`${header}
    <section class="stack-s opinion-brief"><h2>${week.brief?.story || "Your researched story"}</h2><p class="muted">${week.brief?.limits || ""}</p></section>
    ${week.brief?.sensitive ? html`<div class="notice warn"><strong>Sensitive topic</strong> · ${week.brief.sensitive_why}</div>` : ""}
    ${chosen ? html`<div class="notice ok">Opinion chosen: ${chosen.opinion} · ${chosen.tone}. Writing is the next step.</div>` : canChoose ? html`<section class="stack-s opinion-choice-settings">${toneControl("opinion-tone", defaultChoice.tone)}${defaultChoice.option ? html`<p class="opinion-recommended"><strong>Recommended:</strong> ${defaultChoice.option.opinion}</p><button class="btn primary" id="use-recommended-opinion" style="align-self:flex-start">Use recommended opinion</button>` : ""}</section>` : html`<div class="notice info">Opinion choices open when research finishes. Saved options below are read-only for now.</div>`}
    ${opinionCards(week, sources)}
    <p class="small muted">${week.opinions.why_recommended}</p>
    ${!canChoose ? "" : html`<label class="field">Note for the draft (optional)<textarea id="opinion-note" rows="3"></textarea></label><details class="stack opinion-own"><summary>Write my own opinion</summary><label class="field">Your opinion<textarea id="own-opinion" rows="3"></textarea></label><button class="btn" id="use-own-opinion">Use my own opinion</button></details>`}
    `);
  const save = async (button, data) => {
    const tone = root.querySelector('input[name="opinion-tone"]:checked')?.value || defaultChoice.tone;
    const note = root.querySelector("#opinion-note")?.value.trim() || "";
    try {
      await withSaving(button, () => ctx.data.decide(ctx.author, ctx.week, "opinion", { ...data, tone, note }, week.package?.id || null), "Opinion saved. Writing is next.");
      ctx.refresh();
    } catch {}
  };
  root.querySelectorAll(".choose-opinion").forEach((button) => button.addEventListener("click", () => save(button, { action: "choose", option: button.dataset.option })));
  root.querySelector("#use-recommended-opinion")?.addEventListener("click", (event) => save(event.currentTarget, { action: "choose", option: defaultChoice.option.id }));
  root.querySelector("#use-own-opinion")?.addEventListener("click", (event) => {
    const opinion = root.querySelector("#own-opinion").value.trim();
    if (opinion.length < 10) { toast("Write your opinion in at least 10 characters", "bad"); return; }
    save(event.currentTarget, { action: "own", opinion });
  });
  root.addEventListener("input", () => ctx.setDirty(true));
  root.addEventListener("change", () => ctx.setDirty(true));
}