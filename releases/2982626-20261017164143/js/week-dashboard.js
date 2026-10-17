import { html, raw, shiftWeek } from "./util.js";
import { playDashboard, settleCard } from "./motion.js";

const validWeek = (value) => /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/.test(value || "");
const number = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
export const postMetric = (post, key) => post.metrics?.d7?.[key];
export const goalColor = (index) => index < 0 ? "var(--muted)" : `var(--goal-${index % 5 + 1})`;

export function freshPosts(posts, start = "", end = "9999-W53") {
  return posts.filter((post) => validWeek(post.week) && !post.history && !post.archived_run && !post.archived
    && (!validWeek(start) || post.week >= start) && post.week <= end && ["ready", "posted", "measured"].includes(post.status))
    .sort((first, second) => second.week.localeCompare(first.week));
}

function median(values) {
  const sorted = values.filter(number).sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length ? sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2 : null;
}

export function strategyResults(posts, strategies = []) {
  const catalog = strategies.length ? strategies : [...new Set(posts.flatMap((post) => [post.writing_strategy, post.strategy_suggested]).filter(Boolean))]
    .map((id) => ({ id, name: id.replaceAll("-", " ").replace(/^./, (letter) => letter.toUpperCase()) }));
  return catalog.map((strategy) => {
    const actual = posts.filter((post) => post.writing_strategy === strategy.id);
    const suggested = posts.filter((post) => post.strategy_suggested === strategy.id && post.writing_strategy);
    const taken = suggested.filter((post) => post.writing_strategy === strategy.id);
    const saves = actual.map((post) => postMetric(post, "saves")).filter(number);
    const ratings = actual.map((post) => post.rating).filter((rating) => number(rating) && rating >= 1 && rating <= 5);
    return { id: strategy.id, name: strategy.name, posts: actual.length, saves: median(saves), savesCount: saves.length,
      rating: median(ratings), ratingsCount: ratings.length, suggested: suggested.length, taken: taken.length };
  });
}

export function dashboardData(memory, start, week) {
  const posts = freshPosts(memory.posts || [], start, week);
  const recent = posts.filter((post) => post.week >= shiftWeek(week, -11));
  const ledgerGoals = memory.ledger?.goals || [];
  const totalWeight = ledgerGoals.reduce((total, goal) => total + (number(goal.weight) ? goal.weight : 0), 0);
  const goals = ledgerGoals.map((goal, index) => {
    const target = number(goal.target_share) ? Math.min(1, goal.target_share) : totalWeight && number(goal.weight) ? goal.weight / totalWeight : null;
    const served = recent.filter((post) => post.goal === goal.id).length;
    return { ...goal, label: goal.name || goal.question || goal.id, color: goalColor(index), target, served, share: recent.length ? served / recent.length : 0 };
  });
  const targetTotal = goals.reduce((total, goal) => total + (goal.target ?? 0), 0);
  const known = recent.filter((post) => goals.some((goal) => goal.id === post.goal)).length;
  const distance = goals.reduce((total, goal) => total + Math.abs(goal.share - (goal.target ?? 0)), 0) + (recent.length ? 1 - known / recent.length : 0);
  const balance = recent.length && goals.length && goals.every((goal) => goal.target !== null) && Math.abs(targetTotal - 1) < .01
    ? Math.round(100 * Math.max(0, 1 - distance / 2)) : null;
  const saves = posts.map((post) => postMetric(post, "saves")).filter(number);
  const ratings = posts.map((post) => post.rating).filter((rating) => number(rating) && rating >= 1 && rating <= 5);
  const weeks = Array.from({ length: 12 }, (_, index) => {
    const id = shiftWeek(week, index - 11);
    return { id, posts: recent.filter((post) => post.week === id), beforeStart: validWeek(start) && id < start };
  });
  return { posts, recent, goals, weeks, balance, saves: median(saves), savesCount: saves.length, rating: median(ratings), ratingsCount: ratings.length };
}

const format = (value) => value === null ? "Not yet" : new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(value);

export function brandSummary(memory, start, week, author, vision = "") {
  const data = dashboardData(memory, start, week);
  const brandVision = typeof vision === "string" ? vision.trim() : "";
  const gap = [...data.goals].filter((goal) => goal.target !== null && goal.target > goal.share).sort((first, second) => (second.target - second.share) - (first.target - first.share))[0];
  const focus = data.balance === null ? !data.goals.length ? "Your goal targets will appear after the ledger is recorded." : !data.recent.length ? "Your first ready post in this twelve-week window will start the meter." : "Target shares are incomplete. Open Brand to review them."
    : gap ? `Next focus: ${gap.name || gap.id.replaceAll("-", " ")}.` : "Your recent posts match your target mix.";
  return html`<section class="home-brand home-brand-compact" aria-labelledby="home-brand-title"><div class="row between"><h2 id="home-brand-title">Your brand</h2><a class="small" href="#/brand/progress?author=${encodeURIComponent(author)}&week=${week}">Brand progress</a></div>
    ${brandVision ? html`<p class="brand-vision small muted"><strong>Vision:</strong> ${brandVision}</p>` : ""}
    <div class="brand-meter-layout"><div class="brand-barometer" role="${data.balance === null ? "img" : "meter"}" aria-label="Goal mix fit" ${data.balance === null ? raw('aria-description="Not enough recorded goal data yet"') : raw(`aria-valuemin="0" aria-valuemax="100" aria-valuenow="${data.balance}"`)}>
      <svg viewBox="0 0 200 112" aria-hidden="true"><path class="barometer-track" d="M20 96 A80 80 0 0 1 180 96" pathLength="100"></path>${data.balance === null ? "" : html`<path class="barometer-fill" d="M20 96 A80 80 0 0 1 180 96" pathLength="100" stroke-dasharray="${data.balance} 100"></path><g class="barometer-needle" style="transform:rotate(${(data.balance - 50) * 1.8}deg)"><path d="M100 94 L100 31"></path><circle cx="100" cy="94" r="4"></circle></g>`}</svg>
      <div class="barometer-scale" aria-hidden="true"><span>0</span><span>100</span></div>
    </div><div class="brand-meter-copy"><div class="barometer-value" data-stat="balance">${format(data.balance)}${data.balance === null ? "" : html`<small>/100</small>`}</div><p class="small muted">Goal mix fit</p><p class="brand-focus">${focus}</p></div></div>
    <p class="brand-meter-caption small muted"><span data-stat="posts">${data.recent.length}</span> recent post${data.recent.length === 1 ? "" : "s"} · Last twelve weeks. Coverage, not audience growth.</p>
  </section>`;
}

export function weekDashboard(memory, start, week, author, strategies = []) {
  const data = dashboardData(memory, start, week);
  const name = (id) => data.goals.find((goal) => goal.id === id)?.label || id || "No goal recorded";
  const color = (id) => goalColor(data.goals.findIndex((goal) => goal.id === id));
  const maxSaves = Math.max(1, ...data.recent.map((post) => postMetric(post, "saves")).filter(number));
  const moves = new Map((memory.ledger?.move_balance || []).map((move) => [move.id, move.name]));
  const byStrategy = strategyResults(data.posts, strategies);
  const strategyName = (id) => strategies.find((strategy) => strategy.id === id)?.name || id?.replaceAll("-", " ") || "Not recorded";
  return html`<section class="brand-dashboard" aria-labelledby="dashboard-title">
    <div class="row between dashboard-heading"><div><h2 id="dashboard-title">Your brand, week by week</h2><p class="small muted">Your fresh start, with goal coverage over the last twelve weeks.</p></div></div>
    <div class="dashboard-stats">
      <div class="stat"><div class="label">Posts since your fresh start</div><div class="value key-number" data-stat="posts">${data.posts.length}</div><div class="small muted">Ready, posted or measured</div></div>
      <div class="stat"><div class="label">Goal mix fit</div><div class="value" data-stat="balance">${format(data.balance)}${data.balance === null ? "" : html`<span class="stat-unit">/100</span>`}</div><div class="small muted">Actual mix against your targets</div>${data.balance === null ? "" : html`<div class="mix-meter" aria-hidden="true"><span style="transform:scaleX(${data.balance / 100})"></span></div>`}</div>
      <div class="stat"><div class="label">Day-7 saves per post</div><div class="value" data-stat="saves">${format(data.saves)}</div><div class="small muted">Median of ${data.savesCount} day-7 result${data.savesCount === 1 ? "" : "s"}</div></div>
      <div class="stat"><div class="label">Your rating</div><div class="value" data-stat="rating">${format(data.rating)}${data.rating === null ? "" : html`<span class="stat-unit">/5</span>`}</div><div class="small muted">Median of ${data.ratingsCount} rating${data.ratingsCount === 1 ? "" : "s"}</div></div>
    </div>
    ${!data.posts.length ? html`<p class="dashboard-empty">Your first ready post will appear here. Goal targets stay visible below; saves and ratings appear after you add results.</p>` : ""}
    ${data.goals.length ? html`<div class="dashboard-toolbar"><label class="goal-focus-control">Focus on a goal<select aria-label="Focus on a goal"><option value="">All goals</option>${data.goals.map((goal) => html`<option value="${goal.id}">${goal.label}</option>`)}</select></label><p class="goal-focus-summary small muted" role="status">All goals · ${data.recent.length} recent post${data.recent.length === 1 ? "" : "s"}</p></div>` : ""}
    <div class="dashboard-charts">
      <figure class="goal-chart"><figcaption>Goals: your posts against your targets</figcaption>
        ${data.goals.length ? html`<div class="goal-axis" aria-hidden="true"><span>0%</span><span>50%</span><span>100%</span></div><div class="dashboard-goals">${data.goals.map((goal) => html`<div class="dashboard-goal" data-goal="${goal.id}" data-count="${goal.served}" style="--goal-color:${goal.color}">
          <div class="goal-caption"><span><i class="goal-swatch" aria-hidden="true"></i>${goal.label}</span><span>${goal.served} post${goal.served === 1 ? "" : "s"} · ${Math.round(goal.share * 100)}% actual · ${goal.target === null ? "target not recorded" : `target ${Math.round(goal.target * 100)}%`}</span></div>
          <div class="goal-track" aria-hidden="true"><div class="goal-fill" style="transform:scaleX(${goal.share})"></div>${goal.target === null ? "" : html`<span class="goal-target" style="left:${Math.min(99.5, goal.target * 100)}%"></span>`}</div>
        </div>`)}</div><p class="chart-caption">Bars: actual share of ${data.recent.length} fresh posts in twelve weeks. Markers: target share.</p>` : html`<p class="chart-caption">Goal targets will appear after the engine records your goal ledger. No targets have been recorded yet.</p>`}
      </figure>
      <figure class="weeks-chart"><figcaption>The last twelve weeks</figcaption>
        <div class="week-dots" role="list" aria-label="Fresh posts by week">${data.weeks.map((slot) => html`<div class="week-slot ${slot.id === week ? "current" : ""}" role="listitem"><div class="week-dot-stack">${slot.posts.length ? slot.posts.map((post) => html`<button type="button" class="week-dot ${post.status === "ready" ? "unposted" : ""}" data-goal="${post.goal || ""}" data-post="${data.posts.indexOf(post)}" aria-expanded="false" aria-controls="week-inspector" style="--goal-color:${color(post.goal)};--dot-size:${12 + (number(postMetric(post, "saves")) ? 10 * postMetric(post, "saves") / maxSaves : 0)}px" title="${`${slot.id}: ${name(post.goal)}; ${post.status}; ${number(postMetric(post, "saves")) ? `${postMetric(post, "saves")} day-7 saves` : "day-7 saves not recorded"}`}"><span class="sr">${`${slot.id}: ${name(post.goal)}; ${post.status}; ${number(postMetric(post, "saves")) ? `${postMetric(post, "saves")} day-7 saves` : "day-7 saves not recorded"}`}</span></button>`) : html`<span class="week-dot empty-dot"><span class="sr">${slot.id}: ${slot.beforeStart ? "before your fresh start" : "no ready or published post recorded"}</span></span>`}</div><span class="week-label">${slot.id.slice(5)}</span></div>`)}</div>
        <div id="week-inspector" class="week-inspector" role="status" hidden></div>
        <p class="chart-caption">Each dot is a post, colored by its labeled goal. Larger dots mean more day-7 saves. Hollow: ready, not posted. Dashed: no counted post. Day-2 results are not compared here.</p>
        <div class="goal-legend">${data.goals.map((goal) => html`<span data-goal="${goal.id}" style="--goal-color:${goal.color}"><i class="goal-swatch" aria-hidden="true"></i>${goal.label}</span>`)}</div>
      </figure>
    </div>
    <details class="dashboard-method"><summary>How these numbers are counted</summary><p>History, archived packages and posts before your fresh start do not count. Goal mix fit compares the last twelve weeks with your target shares: 100 minus half the total percentage-point difference, including posts with an unrecorded goal. It measures coverage, not audience response. Saves compare day-7 results only; day-2 results remain available on Posts. Missing numbers are never treated as zero.</p></details>
    <section class="dashboard-detail" aria-labelledby="post-detail-title"><h3 id="post-detail-title">How each post supports the brand</h3>
      ${data.posts.length ? html`<div class="table-wrap"><table class="dashboard-table"><thead><tr><th>Week</th><th>Post</th><th>Goal it served</th><th>Story source</th><th>Writing strategy</th><th class="num">Day-7 saves</th><th class="num">Rating</th></tr></thead><tbody>${data.posts.slice(0, 12).map((post) => html`<tr data-goal="${post.goal || ""}"><td data-label="Week"><a href="#/posts?author=${encodeURIComponent(author)}&rate=${post.week}">${post.week}</a><span class="post-status">${post.status}</span></td><td data-label="Post">${post.first_line || post.headline || "Title not recorded"}</td><td data-label="Goal" style="--goal-color:${color(post.goal)}"><i class="goal-swatch" aria-hidden="true"></i>${name(post.goal)}</td><td data-label="Story source">${moves.get(post.move) || post.move?.replaceAll("-", " ") || "Not recorded"}</td><td data-label="Writing strategy">${strategyName(post.writing_strategy)}</td><td data-label="Day-7 saves" class="num">${number(postMetric(post, "saves")) ? postMetric(post, "saves") : "Not yet"}</td><td data-label="Rating" class="num">${number(post.rating) && post.rating >= 1 && post.rating <= 5 ? `${post.rating}/5` : "Not yet"}</td></tr>`)}</tbody></table></div>` : html`<p class="small muted">Post titles, goals and results will appear when your first fresh post is ready.</p>`}
      ${data.posts.length > 12 ? html`<a class="small" href="#/posts?author=${encodeURIComponent(author)}">See all ${data.posts.length} posts</a>` : ""}
    </section>
    <section class="dashboard-detail" aria-labelledby="strategy-results-title"><h3 id="strategy-results-title">By writing strategy</h3>
      ${byStrategy.length ? html`<div class="table-wrap"><table class="dashboard-table"><thead><tr><th>Writing strategy</th><th class="num">Posts</th><th class="num">Median day-7 saves</th><th class="num">Median rating</th><th>Suggestion taken</th></tr></thead><tbody>
        ${byStrategy.map((strategy) => html`<tr><td data-label="Writing strategy">${strategy.name}</td><td data-label="Posts" class="num">${strategy.posts}</td>
          <td data-label="Median day-7 saves" class="num">${strategy.saves === null ? "Not yet" : `${format(strategy.saves)} · n=${strategy.savesCount}`}</td>
          <td data-label="Median rating" class="num">${strategy.rating === null ? "Not yet" : `${format(strategy.rating)}/5 · n=${strategy.ratingsCount}`}</td>
          <td data-label="Suggestion taken">${strategy.suggested ? `${strategy.taken}/${strategy.suggested} · ${Math.round(100 * strategy.taken / strategy.suggested)}%` : "Not yet"}</td></tr>`)}</tbody></table></div>`
        : html`<p class="small muted">Strategy results will appear after posts record a writing strategy.</p>`}
    </section>
  </section>`;
}

export function bindWeekDashboard(root, memory, start, week, author) {
  const dashboard = root.querySelector(".brand-dashboard");
  if (!dashboard) return;
  const data = dashboardData(memory, start, week);
  const select = dashboard.querySelector(".goal-focus-control select");
  const summary = dashboard.querySelector(".goal-focus-summary");
  const inspector = dashboard.querySelector(".week-inspector");
  let keyboard = false;
  dashboard.addEventListener("keydown", () => { keyboard = true; });
  dashboard.addEventListener("pointerdown", () => { keyboard = false; });
  select?.addEventListener("change", () => {
    const selected = data.goals.find((goal) => goal.id === select.value);
    inspector.hidden = true;
    for (const dot of dashboard.querySelectorAll('button[data-post][aria-expanded="true"]')) dot.setAttribute("aria-expanded", "false");
    dashboard.classList.toggle("keyboard-focus", keyboard);
    for (const element of dashboard.querySelectorAll("[data-goal]")) {
      const match = !select.value || element.dataset.goal === select.value;
      element.classList.toggle("is-muted", !match);
      element.classList.toggle("is-focused", !!select.value && match);
    }
    summary.textContent = selected ? `${selected.label} · ${selected.served} of ${data.recent.length} recent posts` : `All goals · ${data.recent.length} recent posts`;
    if (!keyboard) playDashboard(dashboard);
  });
  dashboard.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-post]");
    if (!button) return;
    const post = data.posts[Number(button.dataset.post)];
    if (!post) return;
    const close = button.getAttribute("aria-expanded") === "true";
    for (const dot of dashboard.querySelectorAll("button[data-post]")) dot.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-expanded", String(!close));
    inspector.hidden = close;
    if (close) return;
    const goal = data.goals.find((entry) => entry.id === post.goal);
    inspector.innerHTML = String(html`<div class="row between small muted"><span>${post.week} · ${post.status}</span><span>${number(postMetric(post, "saves")) ? `${postMetric(post, "saves")} day-7 saves` : "Day-7 saves not recorded"}</span></div><p>${post.first_line || post.headline || "Title not recorded"}</p><div class="row between small"><span>${goal?.label || post.goal || "No goal recorded"}</span><a href="#/posts?author=${encodeURIComponent(author)}&rate=${post.week}">Post results</a></div>`);
    if (event.detail !== 0) settleCard(inspector);
  });
  dashboard.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || inspector.hidden) return;
    const open = dashboard.querySelector('button[data-post][aria-expanded="true"]');
    inspector.hidden = true;
    open?.setAttribute("aria-expanded", "false");
    open?.focus();
  });
}