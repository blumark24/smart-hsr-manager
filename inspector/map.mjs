import { coordinates } from "./domain.mjs";
import { icon } from "./icons.mjs";
import { basemapFor } from "./map-provider.mjs";
let library;
async function engine() {
  if (window.maplibregl) return window.maplibregl;
  if (!library)
    library = new Promise((resolve, reject) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "/vendor/maplibre-gl/4.7.1/maplibre-gl.css";
      document.head.append(css);
      const script = document.createElement("script");
      script.src = "/vendor/maplibre-gl/4.7.1/maplibre-gl.js";
      script.onload = () => resolve(window.maplibregl);
      script.onerror = () => {
        library = null;
        reject(new Error("map_engine_unavailable"));
      };
      document.head.append(script);
    });
  return library;
}
const colors = {
  PENDING: "#ff6577",
  IN_PROGRESS: "#ffbd58",
  PENDING_REVIEW: "#7aa3ff",
  COMPLETED: "#27dca9",
};
export async function mountMap(
  element,
  { items, position, center, onSelect, selected, organizationId },
) {
  const controlButtons =
    element.closest(".map-stage")?.querySelectorAll("[data-map-control]") || [];
  for (const button of controlButtons) button.disabled = true;
  const M = await engine();
  if (!element.isConnected) return () => {};
  const first = items.map(coordinates).find(Boolean);
  const coords = position
    ? [position.latitude, position.longitude]
    : first || (center ? [center.lat, center.lng] : null);
  if (!coords) {
    element.innerHTML =
      '<div class="map-empty">حدّد موقعك لإظهار نطاق العمل<br><small>لا تُعرض مواقع أو حالات افتراضية</small></div>';
    return () => {};
  }
  const origin = [coords[1], coords[0]],
    provider = await basemapFor({ organizationId, origin });
  if (!element.isConnected) return () => {};
  element.replaceChildren();
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const map = new M.Map({
    container: element,
    style: provider.style,
    center: origin,
    zoom: 15.8,
    pitch: 42,
    bearing: -17,
    attributionControl: false,
    renderWorldCopies: false,
    maxPitch: 58,
    cooperativeGestures: true,
  });
  element.dataset.provider = provider.id;
  map.addControl(
    new M.AttributionControl({
      compact: false,
      customAttribution: provider.attribution,
    }),
    "bottom-right",
  );
  const attributionLabel = document.createElement("span");
  attributionLabel.className = "map-provider-label";
  attributionLabel.textContent = provider.label;
  element.append(attributionLabel);
  const controls = element
    .closest(".map-stage")
    ?.querySelector(".map-edge-controls");
  const perspective = element
    .closest(".map-stage")
    ?.querySelector('[data-map-control="perspective"]');
  const markers = [];
  let disposed = false;
  for (const item of items) {
    const point = coordinates(item);
    if (!point) continue;
    const node = document.createElement("button");
    node.type = "button";
    node.className = "case-pin" + (selected === item.id ? " is-selected" : "");
    node.style.setProperty("--pin", colors[item.status] || "#81a4b8");
    node.setAttribute("aria-label", item.title || item.id);
    node.innerHTML = `<span>${item.status === "COMPLETED" ? "✓" : item.status === "IN_PROGRESS" ? "↟" : "!"}</span><i></i>`;
    node.onclick = () => {
      for (const m of markers) m.getElement().classList.remove("is-selected");
      node.classList.add("is-selected");
      onSelect(item.id);
    };
    markers.push(
      new M.Marker({ element: node, anchor: "bottom" })
        .setLngLat([point[1], point[0]])
        .addTo(map),
    );
  }
  if (position) {
    const user = document.createElement("div");
    user.className = "user-radar";
    user.setAttribute("role", "img");
    user.setAttribute(
      "aria-label",
      `موقعك · دقة ${Math.round(position.accuracy)} متر`,
    );
    user.innerHTML = `<i></i><b>${icon("navigate")}</b>`;
    markers.push(new M.Marker({ element: user }).setLngLat(origin).addTo(map));
  }
  const dispatch = (event) => {
    const action =
      event.target.closest("[data-map-control]")?.dataset.mapControl;
    if (!action || disposed) return;
    if (action === "zoom-in") map.zoomIn({ duration: reduce ? 0 : 220 });
    if (action === "layers") {
      const layer = map.getLayer("footprints") ? "footprints" : "buildings";
      if (!map.getLayer(layer)) return;
      const showing = map.getLayoutProperty(layer, "visibility") !== "none";
      for (const id of [layer, "edges", "edge-glow", "sourced-heights"]) {
        if (map.getLayer(id))
          map.setLayoutProperty(id, "visibility", showing ? "none" : "visible");
      }
      event.target
        .closest("button")
        ?.setAttribute("aria-pressed", String(!showing));
    }
    if (action === "center")
      map.easeTo({ center: origin, zoom: 15.8, duration: reduce ? 0 : 300 });
    if (action === "perspective") {
      const tilted = map.getPitch() > 10;
      map.easeTo({
        pitch: tilted ? 0 : 42,
        bearing: tilted ? 0 : -17,
        duration: reduce ? 0 : 350,
      });
      perspective?.setAttribute("aria-pressed", String(!tilted));
    }
  };
  const perspectiveControls = perspective?.parentElement;
  controls?.addEventListener("click", dispatch);
  perspectiveControls?.addEventListener("click", dispatch);
  let failed = false;
  map.on("error", () => {
    if (disposed || failed) return;
    failed = true;
    const message = document.createElement("div");
    message.className = "map-load-state";
    message.textContent = "تعذر الاتصال بمصدر الخريطة لهذا النطاق";
    element.append(message);
    element.dataset.mapState = "unavailable";
  });
  map.on("load", () => {
    if (disposed) return;
    element.dataset.mapState = failed ? "unavailable" : "ready";
    if (!failed) for (const button of controlButtons) button.disabled = false;
  });
  return () => {
    disposed = true;
    controls?.removeEventListener("click", dispatch);
    perspectiveControls?.removeEventListener("click", dispatch);
    for (const m of markers) m.remove();
    map.remove();
  };
}
