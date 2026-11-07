import { analyzeRoute, profilePoint, planPace, parseTargetTime, formatDuration, formatPace, PROFILE_MESSAGES } from "../lib/route-analysis.mjs";
import { elevationAxis, comparisonAxis, displayElevation } from "../lib/profile-scales.mjs";
import { chartAxes, svgNode, PROFILE_COLORS, PROFILE_DASHES } from "./profile-chart";
import { initRouteMap } from "./route-map";
type Summary = { id: string; title: string; href: string; mapHref?: string; profileHref?: string; distanceM?: number; baseDistanceM?: number; lapCount: number; status: keyof typeof PROFILE_MESSAGES | "ready"; comparison: boolean; calculator: boolean };
type Geometry = { segments: { lat: number; lon: number; ele: number }[][]; lapCount: number };
type Profile = ReturnType<typeof analyzeRoute>;
const km = (n: number) => (n / 1000).toLocaleString("bg-BG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const metres = (n: number | undefined) => Number.isFinite(n) ? `${Math.round(n!)} м` : "Няма данни";
const percent = (n: number | undefined) => Number.isFinite(n) ? `${(n! * 100).toFixed(1)}%` : "—";
function put(root: ParentNode, selector: string, text: string) { const el = root.querySelector(selector); if (el) el.textContent = text; }
function row(body: Element, values: string[]) { const tr = document.createElement("tr"); for (const value of values) { const td = document.createElement("td"); td.textContent = value; tr.append(td); } body.append(tr); return tr; }

document.querySelectorAll<HTMLElement>("[data-route-analysis]").forEach((root) => {
  const routes: Summary[] = JSON.parse(root.querySelector("[data-analysis-catalog]")?.textContent ?? "[]");
  const single = root.hasAttribute("data-single-route"), cache = new Map<string, Geometry>();
  const selectA = root.querySelector<HTMLSelectElement>('[data-route-select="primary"]');
  const selectB = root.querySelector<HTMLSelectElement>('[data-route-select="secondary"]');
  const selectC = root.querySelector<HTMLSelectElement>('[data-route-select="tertiary"]');
  const overlayMode = root.querySelector<HTMLSelectElement>("[data-overlay-mode]");
  const smoothing = root.querySelector<HTMLSelectElement>("[data-smoothing]")!;
  let generation = 0, activeProfile: Profile | undefined, activeRoute: Summary | undefined;
  const query = new URLSearchParams(location.search);
  if (selectA) selectA.value = routes.find((r) => r.id === query.get("route"))?.id ?? routes[0]?.id ?? "";
  if (selectB) selectB.value = routes.find((r) => r.comparison && r.id === query.get("compare"))?.id ?? "";

  if (selectC) selectC.value = routes.find((r) => r.comparison && r.id === query.get("compare3"))?.id ?? "";

  function mapFor(slot: string) {
    const el = single ? root.closest("article")?.querySelector<HTMLElement>("[data-route-map]")
      : root.querySelector<HTMLElement>(`[data-analysis-slot="${slot}"] [data-route-map]`);
    return el ? initRouteMap(el) : undefined;
  }
  function draw(card: HTMLElement, profile: Profile, maxDistance: number, slot: string) {
    const svg = card.querySelector<SVGSVGElement>("[data-profile-chart]")!;
    svg.replaceChildren();
    if (!profile.available) return;
    const axis = elevationAxis(profile.minM!, profile.maxM!);
    const { x, y, width, left, plotWidth } = chartAxes(svg, axis, maxDistance);
    put(card, "[data-axis-notice]", `Абсолютна височина · вертикално приближение ${axis.min}–${axis.max} м · деление ${axis.step} м. ↕ Отделен вертикален мащаб за всяко трасе; стръмността на нарисуваната линия не е сравнима между панелите.`);
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
    let noise = "";
    if (profile.available && Number(smoothing.value) === 25) {
      const payload = cache.get(route.id);
      if (payload) {
        const baseline = analyzeRoute(payload.segments, { trusted: true, lapCount: route.lapCount, windowM: 100 });
        noise = ` 25 м е чувствителен към GPS шум; за шосе препоръчваме 100 м. Изкачване при 25 м: ${metres(profile.ascentM)}; при 100 м: ${metres(baseline.ascentM)}. Разликата не доказва допълнителни реални хълмове.`;
      }
    }
    put(card, "[data-profile-notice]", profile.available ? `Изглаждане ${smoothing.value} м. Оранжево: профил; светлооранжево: изкачване; зелено: спускане.${noise}` : PROFILE_MESSAGES[route.status === "ready" ? "unavailable" : route.status]);
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
  function renderOverlay(selected: { route: Summary | undefined; slot: string }[], profiles: (Profile | undefined)[], maxDistance: number) {
    const panel = root.querySelector<HTMLElement>("[data-overlay]");
    if (!panel || !overlayMode) return;
    panel.hidden = overlayMode.value === "off";
    if (panel.hidden) return;
    const svg = panel.querySelector<SVGSVGElement>("[data-overlay-chart]")!;
    const legend = panel.querySelector("[data-overlay-legend]")!;
    legend.replaceChildren(); svg.replaceChildren();
    const available = profiles.filter((p) => p?.available);
    svg.toggleAttribute("hidden", available.length < 2);
    const relative = true; // Absolute heights stay in separate zoomed panels, never on a shared overlay axis.
    put(panel, "[data-overlay-unavailable]", available.length < 2 ? "За наслагване са нужни поне два избрани маршрута с надежден разрешен профил. Отделните панели остават достъпни." : available.length < profiles.filter(Boolean).length ? "Маршрутите без надежден разрешен профил не се наслагват." : "");
    if (available.length < 2) return;
    const axis = comparisonAxis(available, relative ? "relative" : "absolute");
    const { x, y } = chartAxes(svg, axis, maxDistance, relative);
    svg.dataset.mode = relative ? "relative" : "absolute";
    svg.setAttribute("aria-label", relative ? "Относителна промяна във височината спрямо старта в метри, по километри" : "Абсолютна надморска височина в метри, по километри");
    put(panel, "[data-overlay-notice]", `Спрямо старта: Δh = височина − начална изгладена височина на собственото трасе. Всеки маршрут започва от 0 м; това не е натрупано изкачване и не нормализира амплитудата. Абсолютните височини са в отделните приближени панели, за да не скриват разликите между градовете релефа. Обща вертикална скала ${axis.min}–${axis.max} м, деление ${axis.step} м; еднаква километрова скала. Отделните графики отдолу запазват собствено вертикално приближение.`);
    selected.forEach(({ route }, i) => {
      const profile = profiles[i]; if (!route || !profile?.available) return;
      const li = document.createElement("li"), swatch = document.createElement("span");
      swatch.className = "profile-swatch"; swatch.style.borderColor = PROFILE_COLORS[i]; swatch.style.borderTopStyle = i === 0 ? "solid" : i === 1 ? "dashed" : "dotted";
      li.append(swatch, document.createTextNode(`${i + 1}. ${route.title}`)); legend.append(li);
      for (const points of profile.segments) svg.append(svgNode("polyline", { points: points.map((p) => `${x(p.x).toFixed(2)},${y(displayElevation(p, profile, relative ? "relative" : "absolute")).toFixed(2)}`).join(" "), fill: "none", stroke: PROFILE_COLORS[i], "stroke-width": 2.5, "stroke-dasharray": PROFILE_DASHES[i], "vector-effect": "non-scaling-stroke", "data-overlay-route": route.id }));
    });
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
    const seen = new Set(primary ? [primary.id] : []);
    const others = [selectB, selectC].map((select) => {
      const route = routes.find((r) => r.id === select?.value && r.comparison);
      const accepted = primary?.comparison && route && !seen.has(route.id) ? route : undefined;
      if (accepted) seen.add(accepted.id);
      if (select) { select.disabled = !primary?.comparison; if (!accepted) select.value = ""; }
      return accepted;
    });
    const [secondary, tertiary] = others;
    for (const select of [selectB, selectC]) if (select) for (const option of select.options) option.disabled = !!option.value && option.value !== select.value && seen.has(option.value);
    root.querySelector<HTMLElement>('[data-analysis-slot="secondary"]')?.toggleAttribute("hidden", !secondary);
    root.querySelector<HTMLElement>('[data-analysis-slot="tertiary"]')?.toggleAttribute("hidden", !tertiary);
    root.querySelector<HTMLElement>("[data-overlay]")?.setAttribute("hidden", "");
    const cards = root.querySelectorAll<HTMLElement>("[data-profile]");
    cards.forEach((c) => { c.querySelector<HTMLElement>("[data-profile-details]")!.hidden = true; put(c, "[data-profile-notice]", "Зареждане…"); c.querySelector("[data-profile-stats]")?.replaceChildren(); });
    put(root, "[data-analysis-status]", secondary || tertiary ? "Подравняване по километри: обща хоризонтална скала и общ прозорец за изглаждане. ↕ Различни вертикални мащаби — всеки панел приближава собствения си релеф. Делението на вертикалната ос не е прозорецът за изглаждане." : "");
    const selected = [{ route: primary, slot: "primary" }, { route: secondary, slot: "secondary" }, { route: tertiary, slot: "tertiary" }];
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
    renderOverlay(selected, profiles, maxDistance);
    activeProfile = profiles[0]; activeRoute = primary;
    if (form) { const strategy = form.elements.namedItem("strategy") as HTMLSelectElement; strategy.options[1].disabled = !activeProfile?.available; if (!activeProfile?.available) strategy.value = "even"; calculate(); }
    if (!single) { const url = new URL(location.href); for (const [key, value] of [["route", primary?.id], ["compare", secondary?.id], ["compare3", tertiary?.id]]) { if (value) url.searchParams.set(key!, value); else url.searchParams.delete(key!); } history.replaceState(null, "", url); }
  }
  selectA?.addEventListener("change", update); selectB?.addEventListener("change", update); selectC?.addEventListener("change", update); overlayMode?.addEventListener("change", update); smoothing.addEventListener("change", update); void update();
  let resizeTimer: number;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = window.setTimeout(update, 150); });
});
