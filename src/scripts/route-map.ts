import L from "leaflet";
import "leaflet/dist/leaflet.css";

document
  .querySelectorAll<HTMLElement>("[data-route-map]")
  .forEach((section) => {
    const button = section.querySelector<HTMLButtonElement>("[data-load-map]");
    const canvas = section.querySelector<HTMLElement>("[data-map-canvas]");
    const status = section.querySelector<HTMLElement>("[data-map-status]");
    let loaded = false;
    button?.addEventListener("click", async () => {
      if (!canvas || !status || loaded) return;
      button.disabled = true;
      status.textContent = "Зареждане на маршрута…";
      try {
        const response = await fetch(section.dataset.mapUrl ?? "");
        if (!response.ok) throw new Error("Маршрутът не може да се зареди.");
        const data: { segments: [number, number][][] } = await response.json();
        if (
          !Array.isArray(data.segments) ||
          !data.segments.length ||
          data.segments.some(
            (segment) =>
              !Array.isArray(segment) ||
              segment.length < 2 ||
              segment.some(
                (point) => point.length !== 2 || !point.every(Number.isFinite),
              ),
          )
        )
          throw new Error("Невалидни данни за карта.");
        canvas.hidden = false;
        const map = L.map(canvas, { scrollWheelZoom: false });
        const line = L.polyline(data.segments, {
          color: "#ff8510",
          weight: 4,
          opacity: 0.95,
        }).addTo(map);
        map.fitBounds(line.getBounds(), { padding: [25, 25], maxZoom: 16 });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          referrerPolicy: "strict-origin-when-cross-origin",
        })
          .on("tileerror", () => {
            status.textContent =
              "Фоновата карта не се зареди. GPX следата остава видима.";
          })
          .addTo(map);
        const first = data.segments[0][0],
          lastSegment = data.segments[data.segments.length - 1],
          last = lastSegment[lastSegment.length - 1];
        L.circleMarker(first, { radius: 6, color: "#50d5a4", fillOpacity: 1 })
          .bindTooltip("Начало на публичното трасе")
          .addTo(map);
        L.circleMarker(last, { radius: 6, color: "#ff8510", fillOpacity: 1 })
          .bindTooltip("Край на публичното трасе")
          .addTo(map);
        loaded = true;
        button.hidden = true;
        status.textContent =
          "Показана е обработената публична версия на маршрута.";
        requestAnimationFrame(() => map.invalidateSize());
      } catch {
        status.textContent = "Маршрутът не може да се зареди. Опитай отново.";
        button.disabled = false;
      }
    });
  });
