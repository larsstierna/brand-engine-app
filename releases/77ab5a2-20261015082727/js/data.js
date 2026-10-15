// Domain-level reads and writes on top of a backend. Paths follow docs/FILE_FORMATS.md.

import { load as yamlLoad, dump as yamlDump } from "../vendor/js-yaml.mjs";
import { today } from "./util.js";
import { scopedJob } from "./operations.js";

export const YAML_HEADER = "# Edited in the Brand Engine app. Field guide: docs/FILE_FORMATS.md\n";

export class Data {
  constructor(backend) {
    this.b = backend;
    this.cache = new Map();
  }

  // ---------- low level ----------
  async text(path, { fresh = false } = {}) {
    if (!fresh && this.cache.has(path)) return this.cache.get(path);
    const p = this.b.readText(path).catch((e) => { this.cache.delete(path); throw e; });
    this.cache.set(path, p);
    return p;
  }
  async json(path, fallback = null) {
    const t = await this.text(path);
    if (t == null || !t.trim()) return fallback;
    try { return JSON.parse(t); } catch { throw new Error(`${path} is not valid JSON`); }
  }
  async yaml(path, fallback = null) {
    const t = await this.text(path);
    if (t == null || !t.trim()) return fallback;
    return yamlLoad(t) ?? fallback;
  }
  invalidate(prefix = "") {
    for (const k of [...this.cache.keys()]) if (k.startsWith(prefix)) this.cache.delete(k);
  }
  dumpYaml(obj, header = YAML_HEADER) {
    return header + yamlDump(obj, { lineWidth: 120, noRefs: true, sortKeys: false });
  }
  async save(files, message) {
    const res = await this.b.commit(files, message);
    for (const f of files) this.cache.delete(f.path);
    return res;
  }

  // ---------- authors ----------
  async authors() {
    const dirs = (await this.b.list("authors")).filter((d) => d.type === "dir");
    const out = [];
    for (const d of dirs) {
      const cfg = await this.yaml(`authors/${d.name}/author.yaml`, null);
      if (cfg) out.push({ id: d.name, ...cfg });
    }
    return out;
  }
  author(id) { return this.yaml(`authors/${id}/author.yaml`, {}); }

  health(id) { return this.json(`authors/${id}/health.json`, {}); }

  async activity(id, week) {
    if (!this.b.jobs) return { job: null, runs: [], unavailable: "Live workflow status is only available on GitHub." };
    try {
      const runs = await this.b.runs();
      const relevant = runs.filter((run) => ["Engine", "Schedule"].includes(run.workflow)).slice(0, 4);
      const groups = await Promise.all(relevant.map(async (run) => ({ run, jobs: await this.b.jobs(run.id) })));
      const match = groups.find((group) => scopedJob(group.jobs, id, week));
      return { runs, job: match ? { ...scopedJob(match.jobs, id, week), run: match.run } : null };
    } catch (error) {
      return { job: null, runs: [], unavailable: `Workflow status unavailable: ${error.message}` };
    }
  }

  async brand(id) {
    const b = `authors/${id}/brand`;
    const [strategy, goals, topics, moves, lenses, voiceRules, visual] = await Promise.all([
      this.yaml(`${b}/strategy.yaml`, {}), this.yaml(`${b}/goals.yaml`, { goals: [] }), this.yaml(`${b}/topics.yaml`, {}),
      this.yaml(`${b}/moves.yaml`, { moves: [] }), this.yaml(`${b}/lenses.yaml`, { lenses: [] }),
      this.yaml(`${b}/voice-rules.yaml`, {}), this.yaml(`${b}/visual.yaml`, {}),
    ]);
    return { strategy, goals, topics, moves, lenses, voiceRules, visual };
  }
  brandText(id, name) { return this.text(`authors/${id}/brand/${name}`); }
  moveLibrary() { return this.yaml("library/moves.yaml", { moves: [] }); }
  async toolbox() {
    const data = await this.yaml("library/steps.yaml", { steps: [] });
    return Object.fromEntries((data.steps || []).map((s) => [s.id, s]));
  }
  async lintRules() { return ((await this.yaml("library/lint-rules.yaml", { rules: [] })) || {}).rules || []; }
  async chains(id) { return ((await this.yaml(`authors/${id}/brand/chains.yaml`, { chains: {} })) || {}).chains || {}; }

  // ---------- memory ----------
  async memory(id) {
    const m = `authors/${id}/memory`;
    const [posts, ledger, positions] = await Promise.all([
      this.json(`${m}/posts.json`, { posts: [] }), this.json(`${m}/goal-ledger.json`, null), this.json(`${m}/positions.json`, { positions: [] }),
    ]);
    return { posts: posts.posts || [], ledger, positions: positions.positions || [] };
  }
  async reviews(id) {
    // Monthly reviews (2026-10.json) and CV calibrations (2026-10-13-cv.json) share one format and one approval flow.
    const files = (await this.b.list(`authors/${id}/memory/reviews`)).filter((f) => /^\d{4}-\d{2}(-\d{2}-cv)?\.json$/.test(f.name));
    files.sort((a, b) => b.name.localeCompare(a.name));
    const out = [];
    for (const f of files.slice(0, 4)) {
      const month = f.name.replace(/\.json$/, "");
      out.push({ month, review: await this.json(f.path, {}), decisions: await this.json(`authors/${id}/memory/reviews/${month}-decisions.json`, {}) });
    }
    return out;
  }

  // ---------- onboarding (authors/<id>/onboarding/) ----------
  async onboarding(id) {
    const o = `authors/${id}/onboarding`;
    const [answers, analysis, followup, plan, review, built] = await Promise.all(
      ["answers", "analysis", "followup", "plan", "plan-review", "built"].map((n) => this.json(`${o}/${n}.json`, null)));
    // Same order as engine/onboarding.py stage()
    const stage = built ? "built" : review?.action === "confirm" ? "plan-confirmed"
      : review?.action === "revise" && plan && Number(review.round || 1) >= Number(plan.round || 1) ? "plan-revising"
      : plan && followup ? "planned" : followup ? "answered" : analysis ? "analysed" : answers ? "submitted" : "none";
    return { stage, mode: answers?.mode || "new", answers, analysis, followup, plan, review, built };
  }

  // ---------- one week ----------
  async week(id, week) {
    const w = `authors/${id}/weeks/${week}`;
    const get = (p, f = null) => this.json(`${w}/${p}`, f);
    const txt = (p) => this.text(`${w}/${p}`);
    const [state, candidates, strategy, story, draftDec, posted, metrics, arc] = await Promise.all([
      get("state.json", { stage: "new", history: [], flags: [], round: 0 }), get("candidates.json"), get("decisions/strategy.json"),
      get("decisions/story.json"), get("decisions/draft.json"), get("decisions/posted.json"), get("decisions/metrics.json"), get("arc.json"),
    ]);
    return { path: w, state, candidates, arc, decisions: { strategy, story, draft: draftDec, posted, metrics }, txt, get };
  }

  // ---------- writes ----------
  decide(id, week, name, data) {
    const body = { ...data, by: "app", at: new Date().toISOString() };
    return this.save([{ path: `authors/${id}/weeks/${week}/decisions/${name}.json`, content: JSON.stringify(body, null, 2) + "\n" }],
      `app: ${id} ${week} ${name} (${data.action || "update"})`);
  }
  addInput(id, kind, { text, title = "", url = "" }) {
    const date = today();
    const name = `${date}-${(title || text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40).replace(/-+$/, "") || "note"}-${Math.random().toString(36).slice(2, 6)}.md`;
    const front = [`date: ${date}`, "source: app", "used: false", title && `title: ${title.replace(/\n/g, " ")}`, url && `url: ${url}`].filter(Boolean);
    return this.save([{ path: `authors/${id}/inputs/${kind}/${name}`, content: `---\n${front.join("\n")}\n---\n${text.trim()}\n` }],
      `app: ${id} adds ${kind}`);
  }
  async inputs(id, kind, limit = 12) {
    const files = (await this.b.list(`authors/${id}/inputs/${kind}`)).filter((f) => f.name.endsWith(".md"));
    files.sort((a, b) => b.name.localeCompare(a.name));
    const out = [];
    for (const f of files.slice(0, limit)) {
      const t = (await this.text(f.path)) || "";
      const m = t.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
      const meta = {};
      if (m) m[1].split("\n").forEach((l) => { const i = l.indexOf(":"); if (i > 0) meta[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
      out.push({ file: f.name, path: f.path, ...meta, text: (m ? m[2] : t).trim() });
    }
    return out;
  }
}
