// Settings: where the data lives (connect), run any engine step by hand, recent runs. Also serves #/connect.

import { $, html, niceDate, saveSettings, toast } from "../util.js";
import { pageHead, withSaving, renderInto } from "../ui.js";
import { GitHubBackend, LocalBackend } from "../backend.js";

const ACTIONS = [
  ["strategy", "Ask which strategy this week", "week"], ["discover", "Find story cards", "week"], ["draft", "Write the draft", "week"], ["revise", "Revise the draft", "week"],
  ["finalize", "Build the ready package", "week"], ["review", "Monthly review", "month"], ["apply-review", "Apply approved review proposals", "month"],
  ["analyse", "Analyse a CV (onboarding)", "week"], ["onboard", "Build the brand from confirmed onboarding", "week"],
];

function connectForm(s) {
  return html`<section class="card stack" aria-labelledby="c-h">
    <h2 id="c-h">Connect to your repository</h2>
    <p class="small muted">The app reads and writes files in your GitHub repository; GitHub Actions does the work. Your token stays in this browser only.</p>
    <div class="form-grid">
      <label class="field">Owner (user or organisation)<input type="text" id="owner" autocomplete="off" value="${s.owner || ""}" placeholder="larsstierna"></label>
      <label class="field">Repository<input type="text" id="repo" autocomplete="off" value="${s.repo || ""}" placeholder="brand-engine"></label>
      <label class="field">Branch<input type="text" id="branch" autocomplete="off" value="${s.branch || "main"}"></label>
      <label class="field">Access token<input type="password" id="token" autocomplete="off" placeholder="${s.token ? "Saved on this device; leave blank to keep it" : "github_pat_…"}">
        <span class="hint">${s.token ? "A token is saved in this browser. Leave blank to keep it, or enter a replacement." : "This browser needs its own fine-grained token for this repository with Contents and Actions read/write. Use the token setup guide below."}</span></label>
    </div>
    <div class="row" style="gap:8px">
      <a class="btn small" href="token-guide.html" target="_blank" rel="noopener">Open token setup guide</a>
      <a class="btn small" href="token-guide.pdf" download>Download guide PDF</a>
    </div>
    <div class="row"><button class="btn primary" id="connect">Test and connect</button>
      <button class="btn" id="local" title="Use python -m engine serve on this computer">Use this computer instead</button>
      ${s.token ? html`<button class="btn danger small" id="forget">Forget token on this device</button>` : ""}</div>
    <p class="small muted" id="c-msg" role="status"></p>
  </section>`;
}

export default async function view(ctx, root) {
  const s = ctx.settings;
  const connected = !!ctx.data;
  const activity = connected && ctx.author ? await ctx.data.activity(ctx.author, ctx.week) : { runs: [] };
  const runs = activity.runs;
  const health = connected && ctx.author ? await ctx.data.health(ctx.author) : {};
  const scheduled = runs.find((run) => run.workflow === "Schedule");
  const successful = runs.find((run) => run.conclusion === "success");
  const expires = ctx.backend?.tokenExpiresAt;
  const expiresSoon = expires && Date.parse(expires) - Date.now() < 7 * 86400000;
  const now = new Date();
  const month = now.toISOString().slice(0, 7);

  renderInto(root, html`
    ${pageHead({ title: connected ? "Settings" : "Welcome to Brand Engine",
      sub: connected ? `Connected to ${ctx.backend.label()}.` : "Each week the engine finds stories that build your brand, you pick one, approve the draft and post it yourself. First, connect the app to your repository." })}
    ${connected ? html`<section class="health-summary" aria-label="Engine health">
      <h2>Engine health</h2>
      <dl class="health-grid">
        <div><dt>Schedule</dt><dd>${scheduled ? `${scheduled.conclusion || scheduled.status} · ${niceDate(scheduled.at)}` : "No scheduled run found in recent history"}</dd></div>
        <div><dt>Last successful workflow</dt><dd>${successful ? `${successful.workflow} · ${niceDate(successful.at)}` : "Not observed in recent history"}</dd></div>
        <div><dt>Email for ${ctx.authorCfg.display_name || ctx.author}</dt><dd>${health.email ? `${health.email.status === "sent" ? "Accepted by mail server" : health.email.status === "not_configured" ? "Not configured" : "Last delivery failed"} · ${niceDate(health.email.at)}` : "Not tested yet"}</dd></div>
        <div><dt>Claude</dt><dd>${health.claude ? `${health.claude.provider || "Provider unknown"} · ${health.claude.status} · ${niceDate(health.claude.at)}${health.claude.http_status ? ` · HTTP ${health.claude.http_status}` : ""}` : "Provider outcome not recorded yet"}</dd></div>
        <div><dt>Email replies</dt><dd>${health.inbox ? `${health.inbox.status} · ${niceDate(health.inbox.at)}` : "Inbox check not recorded yet"}</dd></div>
        <div><dt>Foundry backup</dt><dd>${health.claude?.backup_configured === true ? health.claude.provider === "foundry" && health.claude.status === "completed" ? "Last backup attempt completed" : "Configured; no successful backup observed in this record" : health.claude?.backup_configured === false ? "Not fully configured at last provider attempt" : "Configuration not recorded yet"}</dd></div>
      </dl>
      <p class="small muted">Provider results describe the last recorded attempt, not current quota. ${expires ? `GitHub reports token expiry: ${niceDate(expires)}.` : "GitHub did not report this token's expiry; check it in GitHub."}</p>
      ${expiresSoon ? html`<p class="notice warn">Your GitHub token expires within a week or has expired. Replace it in Repository connection.</p>` : ""}
      ${activity.unavailable ? html`<p class="notice warn">${activity.unavailable}</p>` : ""}
      <a href="#/brand/schedule?author=${ctx.author}">Email address and test delivery</a>
    </section>` : ""}
    <details class="connection-details" ${connected ? "" : "open"}><summary>Repository connection${connected ? ` · ${ctx.backend.label()}` : ""}</summary>${connectForm(s)}</details>
    ${connected ? html`
      <details class="advanced-controls"><summary>Advanced · run an engine step</summary><section class="stack" aria-labelledby="r-h">
        <h2 id="r-h">Run a step now</h2>
        <p class="small muted">Everything runs on its own schedule. Use this to run a step early or again. On a phone you can also do it in the GitHub app: Actions → Engine → Run workflow.</p>
        <div class="form-grid">
          <label class="field">Author<select id="r-author">${ctx.authors.map((a) => html`<option value="${a.id}" ${a.id === ctx.author ? "selected" : ""}>${a.display_name || a.id}</option>`)}</select></label>
          <label class="field">Step<select id="r-action">${ACTIONS.map(([id, label]) => html`<option value="${id}">${label}</option>`)}</select></label>
          <label class="field">Week or month<input type="text" id="r-week" value="${ctx.week}" pattern="\\d{4}-(W\\d{2}|\\d{2})"><span class="hint">A week like ${ctx.week}, or a month like ${month} for reviews.</span></label>
          <label class="field row" style="align-items:center;gap:8px;margin-top:22px"><input type="checkbox" id="r-force"> Replace existing results even if already done</label>
        </div>
        <p class="small muted">Forced runs can replace story cards, drafts, or packages. Normal weekly decisions belong on This week.</p>
        <button class="btn primary" id="run" style="align-self:flex-start">Start</button>
      </section></details>
      <section class="card stack" aria-labelledby="h-h">
        <div class="row between"><h2 id="h-h">Recent runs</h2><button class="btn small" id="reload">Refresh</button></div>
        ${runs.length ? html`<div class="table-wrap"><table><thead><tr><th>Run</th><th>Status</th><th>Started</th></tr></thead><tbody>
          ${runs.map((r) => html`<tr><td>${r.url ? html`<a href="${r.url}" target="_blank" rel="noopener">${r.name}</a>` : r.name}<div class="small muted">${r.workflow}${r.event ? ` · ${r.event}` : ""}</div></td>
            <td><span class="chip ${r.conclusion === "success" || r.conclusion === "ok" ? "ok" : r.conclusion === "failure" || r.conclusion === "failed" ? "warn" : ""}">${r.conclusion || r.status}</span></td>
            <td class="small">${r.at ? niceDate(r.at) : ""}</td></tr>`)}</tbody></table></div>` : html`<p class="muted small">No runs yet.</p>`}
      </section>
      <section class="card stack-s"><h2>Authors</h2>
        <p class="small muted">Each author has their own brand, schedule and email. Edit yours under Brand and strategy.</p>
        <div class="row">${ctx.authors.map((a) => html`<a class="btn small" href="#/brand/overview?author=${a.id}">${a.display_name || a.id}</a>`)}
          <a class="btn small primary" href="#/onboarding/new">+ Add an author</a></div></section>` : ""}
  `);

  const msg = (t) => { $("#c-msg", root).textContent = t; };
  $("#connect", root).addEventListener("click", async (e) => {
    const cfg = { owner: $("#owner", root).value.trim(), repo: $("#repo", root).value.trim(), branch: $("#branch", root).value.trim() || "main", token: $("#token", root).value.trim() || s.token || "" };
    if (!cfg.owner || !cfg.repo || !cfg.token) { msg("Fill in owner, repository and token."); return; }
    const btn = e.currentTarget;
    btn.disabled = true; msg("Testing…");
    try {
      const b = new GitHubBackend(cfg);
      const who = await b.whoami();
      const top = await b.list("");
      if (!top.length) throw new Error(`Could not read ${cfg.owner}/${cfg.repo} on ${cfg.branch}. Check the name and the token's repository access.`);
      if (!top.some((x) => x.name === "engine.yaml")) throw new Error("This repository does not look like a Brand Engine repository (no engine.yaml).");
      msg(`Connected as ${who}.`);
      await ctx.reconnect({ ...cfg, backend: "github" });
    } catch (err) { msg(err.message); } finally { btn.disabled = false; }
  });
  $("#local", root).addEventListener("click", async () => {
    try { await new LocalBackend().list(""); } catch { msg("No local engine found. Run `python -m engine serve` in the repository folder and open the address it prints."); return; }
    await ctx.reconnect({ backend: "local" });
  });
  $("#forget", root)?.addEventListener("click", () => { saveSettings({ token: "", backend: "" }); toast("Token removed from this device"); location.reload(); });
  if (!connected) return;
  $("#reload", root).addEventListener("click", () => ctx.refresh());
  $("#run", root).addEventListener("click", (e) => {
    const action = $("#r-action", root).value;
    let week = $("#r-week", root).value.trim();
    const kind = ACTIONS.find(([id]) => id === action)[2];
    if (kind === "month" && /^\d{4}-W/.test(week)) week = month;
    if (week && !(kind === "month" ? /^\d{4}-\d{2}$/ : /^\d{4}-W\d{2}$/).test(week)) { toast(kind === "month" ? "Use a month like 2026-11" : "Use a week like 2026-W43", "bad"); return; }
    const archived = $("#r-force", root).checked && ["strategy", "discover", "draft", "revise", "finalize"].includes(action);
    if ($("#r-force", root).checked && !window.confirm(archived ? `Start a new ${week} package from ${action}? The current package will be saved in Runs.` : `Replace existing ${action} results for ${$("#r-author", root).value}, ${week}? This may discard finished work.`)) return;
    withSaving(e.currentTarget, () => ctx.backend.dispatch({ action: archived ? `restart-${action}` : action, author: $("#r-author", root).value, week, force: !archived && $("#r-force", root).checked }),
      ctx.backend.kind === "github" ? "Started. It shows under Recent runs in a few seconds." : "Done on this computer.").then(() => setTimeout(() => ctx.refresh(), 3000)).catch(() => {});
  });
  root.addEventListener("input", () => ctx.setDirty(true));
  if (connected && ctx.author) ctx.watch(async () => ({ activity: await ctx.data.activity(ctx.author, ctx.week), health: await ctx.data.health(ctx.author) }), { activity, health });
}
