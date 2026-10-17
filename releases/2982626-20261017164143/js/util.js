// Small helpers: safe HTML templates, weeks, dates, toasts, local settings.
import { toastIn, toastOut } from "./motion.js";

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

// html`<p>${userText}</p>` escapes every value; wrap trusted markup in raw(...)
export class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);
export function html(strings, ...values) {
  let out = "";
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) {
      const v = values[i];
      if (v instanceof Raw) out += v.s;
      else if (Array.isArray(v)) out += v.map((x) => (x instanceof Raw ? x.s : esc(x))).join("");
      else out += esc(v);
    }
  });
  return raw(out);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function toast(message, kind = "") {
  const box = document.getElementById("toasts");
  if (!box) return;
  const t = document.createElement("div");
  t.className = `toast ${kind}`;
  t.textContent = message;
  box.appendChild(t);
  toastIn(t);
  setTimeout(async () => {
    const animation = toastOut(t);
    if (animation) await animation.finished.catch(() => {});
    t.remove();
  }, kind === "bad" ? 7000 : 4000);
}

// ---------- settings kept on this device ----------
const KEY = "brand-engine-settings";
const DEFAULT_SETTINGS = { owner: "larsstierna", repo: "brand-engine", branch: "main" };
export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { ...DEFAULT_SETTINGS, ...(saved && typeof saved === "object" ? saved : {}) };
  } catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: settings live for this visit */ }
  return next;
}

// ---------- weeks (ISO 8601) ----------
export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
export function localDate(tz = "Europe/Stockholm", now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, m, d] = parts.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
// The posting week: the ISO week of tomorrow (a Sunday discovery prepares the coming week).
export function postingWeek(tz) {
  const d = localDate(tz);
  d.setUTCDate(d.getUTCDate() + 1);
  return isoWeek(d);
}
export function weekMonday(week) {
  const [y, w] = week.split("-W").map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - day + 1 + (w - 1) * 7);
  return monday;
}
export function shiftWeek(week, n) {
  const m = weekMonday(week);
  m.setUTCDate(m.getUTCDate() + 7 * n);
  return isoWeek(m);
}
export function weekRange(week) {
  const m = weekMonday(week);
  const s = new Date(m); s.setUTCDate(m.getUTCDate() + 6);
  const f = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${f(m)} – ${f(s)}`;
}
export const today = () => new Date().toISOString().slice(0, 10);
export const thisMonth = () => new Date().toISOString().slice(0, 7);
export function niceDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(+d)) return iso;
  return d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "item";
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast("Copied"); return true; }
  catch { toast("Copy failed: select the text and copy it", "bad"); return false; }
}

export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// Unicode-safe base64
export function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}
export function fromBase64(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
