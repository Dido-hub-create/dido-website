import type { elevationAxis } from "../lib/profile-scales.mjs";
export const PROFILE_COLORS = ["#ff951e", "#65dcc0", "#c6a4ff"];
export const PROFILE_DASHES = ["", "8 3", "3 3"];
export function svgNode(name: string, attrs: Record<string, string | number>, content?: string) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (content) node.textContent = content;
  return node;
}
export function chartAxes(svg: SVGSVGElement, axis: ReturnType<typeof elevationAxis>, maxDistance: number, relative = false) {
  svg.replaceChildren();
  const width = Math.max(240, svg.getBoundingClientRect().width), left = 52, right = width - 15, plotWidth = right - left;
  svg.setAttribute("viewBox", `0 0 ${width} 260`);
  svg.dataset.yMin = String(axis.min); svg.dataset.yMax = String(axis.max); svg.dataset.yStep = String(axis.step); svg.dataset.xMax = String(maxDistance);
  const x = (metres: number) => left + plotWidth * metres / maxDistance;
  const y = (height: number) => 205 - 170 * (height - axis.min) / (axis.max - axis.min);
  for (const height of axis.ticks) {
    svg.append(svgNode("line", { x1: left, x2: right, y1: y(height), y2: y(height), stroke: "#33445b" }));
    svg.append(svgNode("text", { x: left - 7, y: y(height) + 4, fill: "#bdcadd", "text-anchor": "end", "font-size": 12 }, String(height)));
  }
  for (let i = 0; i <= 4; i++) svg.append(svgNode("text", { "data-km-tick": "", x: x(maxDistance * i / 4), y: 230, fill: "#bdcadd", "text-anchor": i === 4 ? "end" : "middle", "font-size": 11 }, (maxDistance * i / 4000).toLocaleString("bg-BG", { maximumFractionDigits: 2 })));
  svg.append(svgNode("text", { x: 8, y: 18, fill: "#bdcadd", "font-size": 12 }, relative ? "Δh (м)" : "h (м)"), svgNode("text", { x: right, y: 253, fill: "#bdcadd", "text-anchor": "end", "font-size": 12 }, "Дистанция (км)"));
  // Axis break explicitly indicates a zoomed elevation axis, rather than sea level.
  if (axis.min !== 0) svg.append(svgNode("path", { d: `M${left-4} 211 l8 -5 m-8 10 l8 -5`, fill: "none", stroke: "#bdcadd", "stroke-width": 1.5, "data-axis-break": "" }));
  return { x, y, width, left, plotWidth };
}
