import L from "leaflet";
import "leaflet/dist/leaflet.css";
type Point = { lat: number; lon: number };
const controllers = new WeakMap<HTMLElement, ReturnType<typeof createController>>();
function createController(section: HTMLElement) {
  const button = section.querySelector<HTMLButtonElement>("[data-load-map]")!;
  const canvas = section.querySelector<HTMLElement>("[data-map-canvas]")!;
  const status = section.querySelector<HTMLElement>("[data-map-status]")!;
  let map: L.Map | undefined, cursor: L.CircleMarker | undefined, selected: Point | undefined;
  let request: AbortController | undefined;
  function selectPoint(point: Point) {
    selected = point;
    if (!map) return;
    if (!cursor) cursor = L.circleMarker([point.lat, point.lon], { radius: 8, color: "#fff", fillColor: "#ff8510", fillOpacity: 1, weight: 3 }).addTo(map);
    cursor.setLatLng([point.lat, point.lon]);
  }
  button.addEventListener("click", async () => {
    if (map || !section.dataset.mapUrl) return;
    request?.abort(); const active = new AbortController(); request = active;
    button.disabled = true; status.textContent = "Зареждане на маршрута…";
    try {
      const response = await fetch(section.dataset.mapUrl, { signal: active.signal });
      if (!response.ok) throw new Error();
      const data: { segments: [number, number][][] } = await response.json();
      if (!Array.isArray(data.segments) || !data.segments.length || data.segments.some((s) => !Array.isArray(s) || s.length < 2 || s.some((p) => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite) || Math.abs(p[0]) > 90 || Math.abs(p[1]) > 180))) throw new Error();
      if (active.signal.aborted) return;
      canvas.hidden = false; map = L.map(canvas, { scrollWheelZoom: false });
      const line = L.polyline(data.segments, { color: "#ff8510", weight: 4, opacity: .95 }).addTo(map);
      map.fitBounds(line.getBounds(), { padding: [25, 25], maxZoom: 16 });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', referrerPolicy: "strict-origin-when-cross-origin" })
        .on("tileerror", () => { status.textContent = "Фоновата карта не се зареди. GPX следата остава видима."; }).addTo(map);
      L.circleMarker(data.segments[0][0], { radius: 6, color: "#50d5a4", fillOpacity: 1 }).bindTooltip("Начало на публичното трасе").addTo(map);
      L.circleMarker(data.segments.at(-1)!.at(-1)!, { radius: 6, color: "#ff8510", fillOpacity: 1 }).bindTooltip("Край на публичното трасе").addTo(map);
      button.hidden = true; status.textContent = "Показана е обработената публична версия на маршрута.";
      if (selected) selectPoint(selected);
      requestAnimationFrame(() => map?.invalidateSize());
    } catch {
      if (active.signal.aborted) return;
      map?.remove(); map = undefined; canvas.hidden = true;
      status.textContent = "Маршрутът не може да се зареди. Опитай отново."; button.disabled = false;
    }
  });
  return { selectPoint, setSource(url?: string) {
    if (section.dataset.mapUrl === (url ?? "")) return;
    request?.abort(); map?.remove(); map = undefined; cursor = undefined; selected = undefined;
    section.dataset.mapUrl = url ?? ""; canvas.hidden = true; button.hidden = false;
    button.disabled = !url; status.textContent = url ? "" : "Няма разрешена публична карта.";
  } };
}
export function initRouteMap(section: HTMLElement) {
  let controller = controllers.get(section);
  if (!controller) { controller = createController(section); controllers.set(section, controller); }
  return controller;
}
document.querySelectorAll<HTMLElement>("[data-route-map]").forEach(initRouteMap);
