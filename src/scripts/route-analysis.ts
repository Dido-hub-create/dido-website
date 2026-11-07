import { analyzeRoute, profilePoint, planPace, parseTargetTime, formatDuration, formatPace, PROFILE_MESSAGES } from "../lib/route-analysis.mjs";
import { initRouteMap } from "./route-map";
type Summary = { id: string; title: string; href: string; mapHref?: string; profileHref?: string; distanceM?: number; baseDistanceM?: number; lapCount: number; status: keyof typeof PROFILE_MESSAGES | "ready"; comparison: boolean; calculator: boolean };
type Geometry = { segments: { lat: number; lon: number; ele: number }[][]; lapCount: number };
type Profile = ReturnType<typeof analyzeRoute>;
const km = (n: number) => (n / 1000).toLocaleString("bg-BG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const metres = (n: number | undefined) => Number.isFinite(n) ? `${Math.round(n!)} м` : "Няма данни";
const percent = (n: number | undefined) => Number.isFinite(n) ? `${(n! * 100).toFixed(1)}%` : "—";
function put(root: ParentNode, selector: string, text: string) { const el = root.querySelector(selector); if (el) el.textContent = text; }
function row(body: Element, values: string[]) { const tr = document.createElement("tr"); for (const value of values) { const td = document.createElement("td"); td.textContent = value; tr.append(td); } body.append(tr); return tr; }
function svgNode(name: string, attrs: Record<string, string | number>, content?: string) { const n = document.createElementNS("http://www.w3.org/2000/svg", name); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v)); if (content) n.textContent = content; return n; }

document.querySelectorAll<HTMLElement>("[data-route-analysis]").forEach((root) => {
  const routes: Summary[] = JSON.parse(root.querySelector("[data-analysis-catalog]")?.textContent ?? "[]");
  const single = root.hasAttribute("data-single-route"), cache = new Map<string, Geometry>();
  const selectA = root.querySelector<HTMLSelectElement>('[data-route-select="primary"]');
  const selectB = root.querySelector<HTMLSelectElement>('[data-route-select="secondary"]');
  const smoothing = root.querySelector<HTMLSelectElement>("[data-smoothing]")!;
  let generation = 0, activeProfile: Profile | undefined, activeRoute: Summary | undefined;
  const query = new URLSearchParams(location.search);
  if (selectA) selectA.value = routes.find((r) => r.id === query.get("route"))?.id ?? routes[0]?.id ?? "";
  if (selectB) selectB.value = routes.find((r) => r.comparison && r.id === query.get("compare"))?.id ?? "";

  function mapFor(slot: string) {
    const el = single ? root.closest("article")?.querySelector<HTMLElement>("[data-route-map]")
      : root.querySelector<HTMLElement>(`[data-analysis-slot="${slot}"] [data-route-map]`);
    return el ? initRouteMap(el) : undefined;
  }
  function draw(card: HTMLElement, profile: Profile, maxDistance: number, slot: string) {
    const svg = card.querySelector<SVGSVGElement>("[data-profile-chart]")!;
    svg.replaceChildren();
    if (!profile.available) return;
    const min = Math.floor(profile.minM! / 10) * 10 - 5, max = Math.ceil(profile.maxM! / 10) * 10 + 5;
    const width = Math.max(240, svg.getBoundingClientRect().width);
    svg.setAttribute("viewBox", `0 0 ${width} 250`);
    const left = 48, right = width - 12, plotWidth = right - left;
    const x = (m: number) => left + plotWidth * m / maxDistance, y = (e: number) => 205 - 170 * (e - min) / (max - min);
    for (let i = 0; i <= 4; i++) {
      const e = min + (max - min) * i / 4;
      svg.append(svgNode("line", { x1: left, x2: right, y1: y(e), y2: y(e), stroke: "#33445b" }));
      svg.append(svgNode("text", { x: left - 7, y: y(e) + 4, fill: "#bdcadd", "text-anchor": "end", "font-size": 11 }, `${Math.round(e)}`));
      svg.append(svgNode("text", { x: x(maxDistance * i / 4), y: 230, fill: "#bdcadd", "text-anchor": i === 4 ? "end" : "middle", "font-size": 11 }, km(maxDistance * i / 4)));
    }
    svg.append(svgNode("text", { x: 16, y: 22, fill: "#bdcadd", "font-size": 11 }, "м"), svgNode("text", { x: right, y: 248, fill: "#bdcadd", "text-anchor": "end", "font-size": 11 }, "км"));
    for (const points of profile.segments) svg.append(svgNode("polyline", { points: points.map((p) => `${x(p.x).toFixed(2)},${y(p.ele).toFixed(2)}`).join(" "), fill: "none", stroke: "#ff951e", "stroke-width": 2.5, "stroke-linejoin": "round", "vector-effect": "non-scaling-stroke" }));
    for (const hill of profile.hills) {
      const pts = profile.segments[hill.segment + (hill.lap - 1) * (profile.segments.length / profile.lapCount)].filter((p) => p.x >= hill.startM && p.x <= hill.endM);
      // Each hill belongs to one segment; do not connect duplicate boundary positions.
      if (pts.length) svg.append(svgNode("polyline", { points: pts.map((p) => `${x(p.x)},${y(p.ele)}`).join(" "), fill: "none", stroke: hill.type === "up" ? "#ffc06a" : "#65dcc0", "stroke-width": 4, "vector-effect": "non-scaling-stroke" }));
    }
    const line = svgNode("line", { x1: left, x2: left, y1: 35, y2: 205, stroke: "#fff", "stroke-dasharray": "4 4" });
    const dot = svgNode("circle", { cx: left, cy: 205, r: 5, fill: "white" }); svg.append(line, dot);
    const slider = card.querySelector<HTMLInputElement>("[data-profile-position]")!;
    slider.max = String(profile.distanceM); slider.step = "any"; slider.value = "0";
    function choose(distance: number) {
      const p = profilePoint(profile, distance); if (!p) return;
      line.setAttribute("x1", String(x(p.x))); line.setAttribute("x2", String(x(p.x)));
      dot.setAttribute("cx", String(x(p.x))); dot.setAttribute("cy", String(y(p.ele)));
      put(card, "[data-profile-readout]", `${km(p.x)} км · ${metres(p.ele)} · наклон ${percent(p.grade)} · обиколка ${p.lap}. Точката е отбелязана и на картата, след като я отвориш.`);
      mapFor(slot)?.selectPoint(p);
    }
    slider.oninput = () => choose(Number(slider.value));
    svg.onpointerdown = (event) => {
      const box = svg.getBoundingClientRect(); const distance = Math.max(0, Math.min(profile.distanceM, ((event.clientX - box.left) / box.width * width - left) / plotWidth * maxDistance));
      slider.value = String(distance); choose(distance);
    };
    choose(0);
  }
  function render(card: HTMLElement, route: Summary, profile: Profile, maxDistance: number, slot: string) {
    put(card, "[data-profile-title]", route.title);
    put(card, "[data-profile-notice]", profile.available ? `Изглаждане ${smoothing.value} м. Оранжево: профил; светлооранжево: изкачване; зелено: спускане.` : PROFILE_MESSAGES[route.status === "ready" ? "unavailable" : route.status]);
    const stats = card.querySelector("[data-profile-stats]")!; stats.replaceChildren();
    const entries = [["Обща дистанция", `${km(profile.distanceM)} км`], ["Обиколки", `${route.lapCount} × ${km(profile.baseDistanceM)} км`], ["Начална височина", metres(profile.startM)], ["Мин. / макс.", `${metres(profile.minM)} / ${metres(profile.maxM)}`], ["Изкачване", metres(profile.ascentM)], ["Спускане", metres(profile.descentM)]];
    for (const [label, value] of entries) { const div = document.createElement("div"), dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = label; dd.textContent = value; div.append(dt, dd); stats.append(div); }
    card.querySelector<HTMLElement>("[data-profile-details]")!.hidden = !profile.available;
    const body = card.querySelector("[data-profile-hills]")!; body.replaceChildren();
    if (!profile.available) return;
    const strongest = [...profile.hills].filter((h) => h.type === "up").sort((a, b) => b.gainM - a.gainM)[0];
    put(card, "[data-hills-summary]", strongest ? `Най-голямо изкачване по натрупване: ${km(strongest.startM)}–${km(strongest.endM)} км, +${metres(strongest.gainM)}, средно ${percent(strongest.averageGrade)}. Това не е обща оценка за трудност.` : "Няма изкачвания над избрания праг.");
    for (const h of profile.hills) row(body, [h.type === "up" ? "↑ Изкачване" : "↓ Спускане", km(h.startM), km(h.endM), `${Math.round(h.lengthM)} м`, `${h.type === "up" ? "+" : "−"}${metres(h.gainM)}`, percent(h.averageGrade), percent(h.maxGrade)]).dataset.hill = h.type;
    if (!profile.hills.length) row(body, ["Няма значими участъци", "—", "—", "—", "—", "—", "—"]);
    draw(card, profile, maxDistance, slot);
  }
  const form = root.querySelector<HTMLFormElement>("[data-pace-form]");
  function calculate() {
    if (!form) return;
    const result = root.querySelector<HTMLElement>("[data-pace-result]")!; result.hidden = true;
    if (!activeProfile || !activeRoute?.calculator) { put(root, "[data-pace-status]", "Този маршрут не е наличен в калкулатора."); return; }
    const fields = new FormData(form), target = parseTargetTime(String(fields.get("target")));
    if (!target) { put(root, "[data-pace-status]", "Въведи валидно време ЧЧ:ММ:СС, по-голямо от нула и до 48:00:00."); return; }
    try {
      const strategy = String(fields.get("strategy"));
      const plan = planPace(activeProfile, target, { strategy, uphill: Number(fields.get("uphill")), downhill: Number(fields.get("downhill")) });
      put(root, "[data-pace-status]", `${activeRoute.title} · ${km(activeProfile.distanceM)} км · средно ${formatPace(plan.averagePace)} · точно общо ${formatDuration(plan.targetSeconds)}.${!activeProfile.available ? " Няма надежден разрешен профил: само равномерно темпо." : " Ориентировъчен план, не гарантирана прогноза."}`);
      const body = root.querySelector("[data-pace-rows]")!; body.replaceChildren();
      for (const r of plan.rows) row(body, [`${km(r.startM)}–${km(r.endM)}`, formatPace(r.pace), formatDuration(r.seconds), formatDuration(r.cumulativeSeconds)]);
      const checkpoints = root.querySelector("[data-pace-checkpoints]")!; checkpoints.replaceChildren();
      for (const p of plan.checkpoints) { const li = document.createElement("li"); li.textContent = `Обиколка ${p.lap} · ${km(p.distanceM)} км · ${formatDuration(p.seconds)}`; checkpoints.append(li); }
      result.hidden = false;
    } catch { put(root, "[data-pace-status]", "Планът не може да се изчисли. Провери времето, разрешенията за профила и параметрите (U: 0–8, D: 0–4)."); }
  }
  form?.addEventListener("submit", (e) => { e.preventDefault(); calculate(); });
  async function update() {
    const ownGeneration = ++generation; activeProfile = undefined; activeRoute = undefined;
    root.querySelector<HTMLElement>("[data-pace-result]")?.setAttribute("hidden", "");
    const primary = routes.find((r) => r.id === (single ? routes[0]?.id : selectA?.value));
    let secondary = routes.find((r) => r.id === selectB?.value && r.comparison);
    if (!primary?.comparison || secondary?.id === primary.id) secondary = undefined;
    if (selectB) {
      selectB.disabled = !primary?.comparison;
      for (const option of selectB.options) option.disabled = option.value === primary?.id;
      if (!secondary) selectB.value = "";
    }
    root.querySelector<HTMLElement>('[data-analysis-slot="secondary"]')?.toggleAttribute("hidden", !secondary);
    const cards = root.querySelectorAll<HTMLElement>("[data-profile]");
    cards.forEach((c) => { c.querySelector<HTMLElement>("[data-profile-details]")!.hidden = true; put(c, "[data-profile-notice]", "Зареждане…"); c.querySelector("[data-profile-stats]")?.replaceChildren(); });
    put(root, "[data-analysis-status]", secondary ? "Двете графики използват една и съща километрова скала и изглаждане. Вертикалните скали са надписани отделно." : "");
    const selected = [{ route: primary, slot: "primary" }, { route: secondary, slot: "secondary" }];
    const profiles = await Promise.all(selected.map(async ({ route, slot }) => {
      if (!route) return undefined;
      if (!single) mapFor(slot)?.setSource(route.mapHref);
      const fallback: Profile = { available: false, quality: route.status, distanceM: route.distanceM ?? 0, baseDistanceM: route.baseDistanceM ?? 0, lapCount: route.lapCount, segments: [], hills: [] };
      if (!route.profileHref) return fallback;
      try {
        let payload = cache.get(route.id);
        if (!payload) { const response = await fetch(route.profileHref); if (!response.ok) throw new Error(); payload = await response.json() as Geometry; cache.set(route.id, payload); }
        return analyzeRoute(payload.segments, { trusted: true, lapCount: route.lapCount, windowM: Number(smoothing.value) });
      } catch { return { ...fallback, quality: "unavailable" }; }
    }));
    if (ownGeneration !== generation) return;
    const maxDistance = Math.max(1, ...profiles.map((p) => p?.distanceM ?? 0));
    selected.forEach(({ route, slot }, i) => {
      const card = root.querySelector<HTMLElement>(`[data-profile="${slot}"]`), profile = profiles[i];
      if (!card) return;
      if (!route || !profile || !(profile.distanceM > 0)) { put(card, "[data-profile-notice]", PROFILE_MESSAGES.unavailable); return; }
      render(card, route, profile, maxDistance, slot);
    });
    activeProfile = profiles[0]; activeRoute = primary;
    if (form) { const strategy = form.elements.namedItem("strategy") as HTMLSelectElement; strategy.options[1].disabled = !activeProfile?.available; if (!activeProfile?.available) strategy.value = "even"; calculate(); }
    if (!single) { const url = new URL(location.href); for (const [key, value] of [["route", primary?.id], ["compare", secondary?.id]]) { if (value) url.searchParams.set(key!, value); else url.searchParams.delete(key!); } history.replaceState(null, "", url); }
  }
  selectA?.addEventListener("change", update); selectB?.addEventListener("change", update); smoothing.addEventListener("change", update); void update();
  let resizeTimer: number;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = window.setTimeout(update, 150); });
});
