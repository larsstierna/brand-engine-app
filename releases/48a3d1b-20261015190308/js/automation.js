import { html, weekMonday } from "./util.js";
import { opinionDefault, weekFlow } from "./ui.js";

const DAYS = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
const DEFAULTS = { strategy_prompt: { day: "sat", time: "18:00" }, strategy_by: { day: "sun", time: "12:00" }, discover: { day: "sun", time: "18:00" }, pick_by: { day: "mon", time: "12:00" }, opinion_by: { day: "mon", time: "18:00" }, approve_by: { day: "tue", time: "07:00" } };
const when = (spec) => `${DAYS[spec.day] || spec.day} ${spec.time}`;

export function firstDiscovery(week, memory, config = {}) {
  return config.enabled !== false && week.state.stage === "new" && !week.package?.manual && !week.decisions.strategy && !(memory.posts || []).length && !week.candidates;
}

export function configuredCutoff(week, spec, timezone) {
  try {
    const offsets = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: -2, sun: -1 };
    const [hour, minute] = spec.time.split(":").map(Number);
    if (!(spec.day in offsets) || !Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    const desired = weekMonday(week).getTime() + offsets[spec.day] * 86400000 + hour * 3600000 + minute * 60000;
    const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    let instant = desired;
    for (let attempt = 0; attempt < 3; attempt++) {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
      const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
      if (represented === desired) return instant;
      instant += desired - represented;
    }
  } catch {}
  return null;
}

export function automationPlan(ctx, week, status = {}, { health = {}, firstWeek = false } = {}) {
  const config = ctx.authorCfg || {};
  const schedule = { ...DEFAULTS, ...config.schedule };
  const manual = !!week.package?.manual;
  const opinion = opinionDefault(week, ctx.voiceRules || {});
  const opinionText = opinion.option ? `Use recommended option ${opinion.option.id.replace(/^o/, "")}, with a ${opinion.tone} tone, then write the draft.` : "Use the recommended opinion and its resolved default tone, then write the draft.";
  const outcomes = {
    strategy: "Use the recommended strategy, then find stories.",
    pick: config.defaults?.no_pick === "skip_week" ? "Skip this week; do not choose a story." : `Choose the first eligible story, then ${weekFlow(week) === 2 ? "research it" : "write the draft"}.`,
    opinion: opinionText,
    draft: config.defaults?.no_approval === "skip_week" ? "Skip this week; do not prepare a ready package." : "Prepare a package marked not reviewed. You still decide whether to post it.",
  };
  const gate = ({ new: "strategy", strategy: "strategy", discovered: "pick", researched: "opinion", drafted: "draft" })[week.state.stage];
  const cutoff = gate ? schedule[({ strategy: "strategy_by", pick: "pick_by", opinion: "opinion_by", draft: "approve_by" })[gate]] : null;
  const rows = [
    ...(schedule.strategy_gate !== false && !firstWeek ? [{ label: "Strategy question", at: when(schedule.strategy_prompt), outcome: "Ask you which strategy to use." }, { label: "Strategy cutoff", at: when(schedule.strategy_by), outcome: outcomes.strategy }] : [{ label: "Find stories", at: firstWeek ? "Next schedule check" : when(schedule.discover), outcome: "Start discovery without a strategy question." }]),
    { label: "Story cutoff", at: when(schedule.pick_by), outcome: outcomes.pick },
    ...(weekFlow(week) === 2 ? [{ label: "Opinion cutoff", at: when(schedule.opinion_by), outcome: outcomes.opinion }] : []),
    { label: "Review cutoff", at: when(schedule.approve_by), outcome: outcomes.draft },
    { label: "Posting", at: "By you", outcome: "The engine never posts. Your preferred posting time is a suggestion, not an automatic task." },
    { label: "Results", at: "Day 2 and day 7", outcome: "Ask for numbers after the posting date you record." },
    ...(config.monthly_review !== false ? [{ label: "Brand review", at: "First three days of the month", outcome: "Run the monthly review if that month's review has not been recorded yet." }] : []),
  ];
  const base = { manual, rows, timezone: config.timezone || ctx.tz || "Europe/Stockholm", cutoff: cutoff ? when(cutoff) : null, cutoffLabel: "Scheduled cutoff" };
  if (config.enabled === false) return { ...base, cutoff: null, kind: "paused", title: "Automatic schedule is disabled", text: "This author is disabled. No scheduled work is expected until the author is enabled again." };
  if (manual && ["new", "strategy", "discovered", "researched", "drafted", "picked", "revising", "approved"].includes(week.state.stage)) return { ...base, cutoff: null, kind: "manual", title: "Deadline defaults are paused", text: "No answer means no automatic choice. Choose the next step yourself; the engine can continue from your saved choice." };
  if (["ready", "posted", "measured", "skipped"].includes(week.state.stage)) return { ...base, cutoff: null, kind: "posting", title: week.state.stage === "ready" ? "Posting is always your decision" : week.state.stage === "skipped" ? "This week is skipped" : "Results follow your posting date", text: week.state.stage === "skipped" ? "Nothing will be posted from this package." : "Nothing is published automatically. Record the posting date to receive day-2 and day-7 number requests." };
  if (["running", "queued", "handoff"].includes(status.phase)) return { ...base, cutoff: null, kind: "working", title: status.phase === "running" ? "No answer is needed while the engine works" : status.phase === "queued" ? "GitHub has queued the next step" : "Your saved choice is enough", text: status.phase === "running" ? "The engine is working. No answer is needed until the next decision appears." : status.phase === "queued" ? "Wait for the workflow to start. The next decision appears when this work finishes." : "The next step follows your saved choice. A saved choice is not proof that the workflow has started." };
  if (status.phase === "failed") return { ...base, cutoff: null, kind: "paused", title: "The current step needs attention", text: "Check workflow status before expecting the next automatic step." };
  if (firstWeek && week.state.stage === "new") return { ...base, cutoff: null, kind: "automatic", title: "Your first discovery starts automatically", text: "The first package can start discovery at the next schedule check without waiting for a strategy question." };
  if (week.state.stage === "new" && schedule.strategy_gate === false) return { ...base, cutoff: when(schedule.discover), kind: "automatic", title: "Discovery is scheduled", text: "No strategy answer is needed. Discovery starts on an available schedule check after its configured time." };
  const pending = Object.values(health.email_pending || {}).some((item) => item.week === ctx.week && (item.kind === gate || gate === "draft" && item.kind?.startsWith("draft.r")) && (!item.package_id || item.package_id === week.package?.id));
  if (!config.owner && (pending || health.inbox && health.inbox.status !== "checked")) return { ...base, cutoff: null, kind: "delivery", title: "Automatic choices are waiting for email recovery", text: pending ? "The current decision email has not been sent successfully. Deadline choices pause while it is retried." : "The reply inbox has not been checked successfully. Deadline choices pause so a reply is not missed." };
  const deliveryKind = gate === "draft" ? `draft.r${week.state.round || 0}` : gate;
  const delivered = health.email_delivered?.[`${ctx.week}:${deliveryKind}`];
  const deliveryAt = Date.parse(delivered?.at || "");
  const scheduledAt = cutoff ? configuredCutoff(ctx.week, cutoff, base.timezone) : null;
  if (Number.isFinite(deliveryAt) && scheduledAt !== null && deliveryAt > scheduledAt && (!delivered.package_id || delivered.package_id === week.package?.id)) {
    const replyBy = new Intl.DateTimeFormat("en-GB", { timeZone: base.timezone, weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(deliveryAt + 86400000));
    return { ...base, cutoff: replyBy, cutoffLabel: "Reply by", kind: "automatic", title: "Your reply window was extended", text: `The decision email was sent late; the engine allows 24 hours from the recorded successful send. If you do not answer: ${outcomes[gate]}` };
  }
  return { ...base, kind: "automatic", title: "If you do not answer", text: outcomes[gate] || "The next task depends on the current package state and recorded choices." };
}

export function automationCard(ctx, week, status, options) {
  const plan = automationPlan(ctx, week, status, options);
  const content = html`<section class="automation-card ${plan.kind}" aria-label="Automatic next step"><div class="automation-current"><div><h2>${plan.title}</h2><p>${plan.text}</p></div>${plan.cutoff ? html`<div class="automation-cutoff"><span>${plan.cutoffLabel}</span><strong>${plan.cutoff}</strong><small>${plan.timezone}</small></div>` : html`<span class="chip">${plan.kind === "manual" ? "Manual control" : plan.kind === "delivery" || plan.kind === "paused" ? "Paused" : plan.kind === "working" ? "No answer needed now" : plan.kind === "posting" ? "By you" : "Automatic"}</span>`}</div>
    <details class="automation-schedule"><summary>${plan.manual ? "What manual control means" : "See the automatic week"}</summary>${plan.manual ? html`<p>Deadline defaults are paused for this package. You choose strategy, story, opinion and review as applicable; the engine performs the steps that follow your choices. Starting a new package does not turn deadline defaults back on.</p>` : html`<dl>${plan.rows.map((row) => html`<div><dt><strong>${row.label}</strong><span>${row.at}</span></dt><dd>${row.outcome}</dd></div>`)}</dl>`}<p class="small muted">Times use ${plan.timezone}. Schedule checks run roughly every two hours; GitHub queues can delay work. A configured cutoff is not an exact start time. Send failures or inbox problems can pause automatic choices; a late successful send can extend the reply window by 24 hours.</p><a class="small" href="#/brand/schedule?author=${encodeURIComponent(ctx.author)}">Schedule and defaults</a></details>
  </section>`;
  return options?.compact ? html`<details class="automation-disclosure"><summary>${plan.kind === "manual" ? "Manual control · deadline defaults paused" : plan.cutoff ? `If you do not answer · ${plan.cutoff} (${plan.timezone})` : plan.title}</summary>${content}</details>` : content;
}