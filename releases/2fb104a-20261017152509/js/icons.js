import { esc } from "./util.js";

const nodes = {
  "new-chat": [["path", { d: "M12 20H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7M16 3h5v5M21 3l-9 9" }]],
  voice: [["path", { d: "M2 10v4m4-7v10m4-14v18m4-14v10m4-13v16m4-10v4" }]],
  "brand-chat": [["path", { d: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" }]],
  send: [["path", { d: "m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13" }]],
  calendar: [["path", { d: "M8 2v3" }], ["path", { d: "M16 2v3" }], ["rect", { x: 3, y: 3, width: 18, height: 18, rx: 2 }], ["path", { d: "M3 9h18" }], ["path", { d: "M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01" }]],
  posts: [["path", { d: "M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4M2 6h4M2 10h4M2 14h4M2 18h4" }], ["path", { d: "M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z" }]],
  runs: [["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M12 7v5l4 2" }]],
  brand: [["circle", { cx: 12, cy: 12, r: 10 }], ["circle", { cx: 12, cy: 12, r: 6 }], ["circle", { cx: 12, cy: 12, r: 2 }]],
  inputs: [["polyline", { points: "22 12 16 12 14 15 10 15 8 12 2 12" }], ["path", { d: "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" }]],
  settings: [["path", { d: "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" }], ["circle", { cx: 12, cy: 12, r: 3 }]],
  previous: [["path", { d: "m15 18-6-6 6-6" }]],
  next: [["path", { d: "m9 18 6-6-6-6" }]],
  more: [["circle", { cx: 5, cy: 12, r: 1 }], ["circle", { cx: 12, cy: 12, r: 1 }], ["circle", { cx: 19, cy: 12, r: 1 }]],
  check: [["path", { d: "M20 6 9 17l-5-5" }]],
  x: [["path", { d: "m18 6-12 12M6 6l12 12" }]],
  clock: [["circle", { cx: 12, cy: 12, r: 10 }], ["path", { d: "M12 6v6l4 2" }]],
};

export function icon(name) {
  const paths = nodes[name];
  if (!paths) return "";
  return `<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths.map(([tag, attributes]) => `<${tag} ${Object.entries(attributes).map(([key, value]) => `${key}="${esc(value)}"`).join(" ")}></${tag}>`).join("")}</svg>`;
}