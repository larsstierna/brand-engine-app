import { html, niceDate } from "./util.js";
import { withSaving, weekFlow } from "./ui.js";
import { jobAction } from "./operations.js";

const STEPS = [
  { id: "discover", label: "Find stories", page: "pick" },
  { id: "pick", label: "Choose story", page: "pick", needs: "cards" },
  { id: "research", label: "Research story", page: "opinion", needs: "story", flow: 2 },
  { id: "opinion", label: "Choose opinion", page: "opinion", needs: "research", flow: 2 },
  { id: "draft", label: "Write draft", page: "draft", needs: "story" },
  { id: "revise", label: "Revise requested changes", page: "draft", needs: "change" },
  { id: "approve", label: "Review and approve", page: "draft", needs: "draft" },
  { id: "finalize", label: "Build ready package", page: "ready", needs: "approved" },
  { id: "posted", label: "Record posting", page: "ready", needs: "ready" },
  { id: "metrics", label: "Record metrics", page: "posts", needs: "posted" },
];

function available(step, week) {
  if (step.id === "draft" && weekFlow(week) === 2) return !!week.decisions.opinion && week.artifacts.research;
  return !step.needs || ({ cards: !!week.candidates?.candidates?.length, story: ["pick", "own"].includes(week.decisions.story?.action),
    research: week.artifacts.research,
    change: week.artifacts.draft && week.decisions.draft?.action === "change", draft: week.artifacts.draft,
    approved: week.artifacts.draft && ["approve", "edit"].includes(week.decisions.draft?.action),
    ready: week.artifacts.ready, posted: week.artifacts.ready && !!week.decisions.posted })[step.needs];
}

const key = (ctx) => `package-restart:${ctx.author}:${ctx.week}`;
function pending(ctx, week) {
  try {
    const request = JSON.parse(sessionStorage.getItem(key(ctx)) || "null");
    if (request && week.package?.id !== request.previous && week.package?.id) {
      sessionStorage.removeItem(key(ctx));
      return null;
    }
    return request;
  } catch { return null; }
}

export function packageControls(ctx, week, { busy = false, job = null, compact = false } = {}) {
  let waiting = pending(ctx, week);
  if (waiting && job?.status === "completed" && job.conclusion !== "success" && Date.parse(job.at) >= Date.parse(waiting.at)) {
    sessionStorage.removeItem(key(ctx));
    waiting = null;
  }
  const activeStep = jobAction(job)?.replace(/^restart-/, "");
  const suggested = ({ discover: "discover", research: "pick", opinion: "opinion", draft: weekFlow(week) === 2 ? "opinion" : "draft",
    revise: weekFlow(week) === 2 ? "opinion" : "draft", finalize: "approve", posted: "posted", metrics: "metrics" })[activeStep]
    || (weekFlow(week) === 2 && week.artifacts.research ? "opinion" : "discover");
  const availableSteps = STEPS.filter((step) => !step.flow || weekFlow(week) === step.flow).filter((step) => available(step, week));
  const restartChooser = html`<label class="field">Restart from<select id="package-step">${availableSteps.map((step) => html`<option value="${step.id}" ${step.id === suggested ? "selected" : ""}>${step.label}</option>`)}</select></label>`;
  const restartLabel = busy ? "Stop and restart from this step" : compact ? "Start a new post for this week" : "Start new package";
  const statusText = waiting ? "New package queued. This package stays visible until the saved replacement is available."
    : busy ? "This will supersede only the running task for this author and week; other authors continue. The current package is saved in Runs."
      : compact ? "" : "The current package is saved in Runs before this step and its later results are restarted.";
  if (compact) return html`<section class="package-controls package-start ${busy ? "package-restart-active" : ""}" aria-label="Weekly package">
    ${busy ? restartChooser : ""}
    <button class="btn primary" id="restart-package" data-busy="${busy}" ${waiting ? "disabled" : ""}>${restartLabel}</button>
    <p class="small muted" id="package-status" role="status">${statusText}</p>
  </section>`;
  return html`<section class="package-controls stack" aria-label="Weekly package">
    <div class="row between"><h2>Weekly package</h2><a href="#/runs?author=${ctx.author}&week=${ctx.week}">Past runs (${week.runs.length})</a></div>
    <p class="small muted">${week.package ? `Opened ${niceDate(week.package.created_at)} from ${week.package.from_step}. Manual control; deadline defaults are paused.` : "Current package"}</p>
    <div class="package-actions">
      <label class="field">Step<select id="package-step">${STEPS.filter((step) => !step.flow || weekFlow(week) === step.flow).map((step) => html`<option value="${step.id}" ${step.id === suggested ? "selected" : ""} ${available(step, week) ? "" : "disabled"}>${step.label}${available(step, week) ? "" : " (earlier input needed)"}</option>`)}</select></label>
      <a class="btn" id="open-package-step" aria-disabled="${!!(busy || waiting)}" href="#/pick?author=${ctx.author}&week=${ctx.week}">Open step</a>
      <button class="btn primary" id="restart-package" data-busy="${busy}" ${waiting ? "disabled" : ""}>${restartLabel}</button>
    </div>
    <p class="small muted" id="package-status" role="status">${statusText}</p>
  </section>`;
}

export function bindPackageControls(ctx, root, week) {
  const select = root.querySelector("#package-step");
  if (!root.querySelector("#restart-package")) return;
  const link = root.querySelector("#open-package-step");
  link?.addEventListener("click", (event) => { if (link.getAttribute("aria-disabled") === "true") event.preventDefault(); });
  select?.addEventListener("change", () => {
    const step = STEPS.find((item) => item.id === select.value);
    link.href = `#/${step.page}?${new URLSearchParams({ author: ctx.author, week: ctx.week, ...(step.id === "metrics" ? { rate: ctx.week } : {}) })}`;
  });
  root.querySelector("#restart-package").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const step = STEPS.find((item) => item.id === (select?.value || "discover"));
    if (!available(step, week)) return;
    const question = button.dataset.busy === "true" ? `Stop the running task for ${ctx.week} and restart from "${step.label}"?`
      : select ? `Start a new package from "${step.label}" for ${ctx.week}?` : `Start a new post for ${ctx.week}, beginning with finding stories?`;
    if (!window.confirm(`${question} The current package will be saved in Runs. Later results will be cleared from the new package; deadline defaults will be paused.`)) return;
    try {
      await withSaving(button, () => ctx.backend.dispatch({ action: `restart-${step.id}`, author: ctx.author, week: ctx.week }), "New package requested");
      sessionStorage.setItem(key(ctx), JSON.stringify({ previous: week.package?.id || null, step: step.id, at: new Date().toISOString() }));
      ctx.refresh();
    } catch {}
  });
}