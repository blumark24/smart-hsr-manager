import { coordinates } from "./domain.mjs";
let library;
async function leaflet() {
  if (window.L) return window.L;
  if (!library)
    library = new Promise((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.crossOrigin = "anonymous";
      link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
      link.href = "/vendor/leaflet/1.9.4/leaflet.css";
      document.head.append(link);
      const script = document.createElement("script");
      script.crossOrigin = "anonymous";
      script.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
      script.src = "/vendor/leaflet/1.9.4/leaflet.js";
      script.onload = () => resolve(window.L);
      script.onerror = () => {
        library = null;
        reject(new Error("map_unavailable"));
      };
      document.head.append(script);
    });
  return library;
}
export async function mountMap(
  element,
  { items, position, center, onSelect, selected },
) {
  const L = await leaflet();
  if (!element.isConnected) return () => {};
  const first = items.map(coordinates).find(Boolean);
  const origin = position
    ? [position.latitude, position.longitude]
    : first || (center ? [center.lat, center.lng] : null);
  if (!origin) {
    element.textContent = "حدّد موقعك أو أضف بلاغاً لإظهار نطاق العمل";
    return () => {};
  }
  element.replaceChildren();
  const map = L.map(element, { zoomControl: false }).setView(origin, 14);
  const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  let mapWarning;
  tiles.on("tileerror", () => {
    if (mapWarning) return;
    mapWarning = document.createElement("div");
    mapWarning.className = "map-status";
    mapWarning.textContent =
      "خلفية الخريطة غير متاحة؛ مواقع البلاغات ظاهرة بالإحداثيات.";
    element.append(mapWarning);
  });
  L.control.zoom({ position: "topleft" }).addTo(map);
  if (position) {
    L.circle(origin, {
      radius: position.accuracy,
      color: "#319cff",
      weight: 1,
      fillOpacity: 0.12,
    }).addTo(map);
    L.circleMarker(origin, {
      radius: 9,
      color: "#fff",
      weight: 3,
      fillColor: "#16b5ff",
      fillOpacity: 1,
    }).addTo(map);
  }
  const markers = new Map();
  const choose = (id) => {
    for (const [key, marker] of markers) marker.setRadius(key === id ? 12 : 8);
    onSelect(id);
  };
  for (const item of items) {
    const point = coordinates(item);
    if (!point) continue;
    const marker = L.circleMarker(point, {
      radius: item.id === selected ? 12 : 8,
      color: "#fff",
      weight: 3,
      fillColor:
        {
          PENDING: "#fa6570",
          IN_PROGRESS: "#fbb24d",
          PENDING_REVIEW: "#81a4ff",
          COMPLETED: "#23d6a1",
        }[item.status] || "#8aa3b5",
      fillOpacity: 1,
    }).addTo(map);
    markers.set(item.id, marker);
    marker.on("click", () => choose(item.id));
    const node = marker.getElement();
    if (node) {
      node.setAttribute("tabindex", "0");
      node.setAttribute("role", "button");
      node.setAttribute("aria-label", item.title || item.id);
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          choose(item.id);
        }
      });
    }
    const label = document.createElement("span");
    label.textContent = item.title || item.id;
    marker.bindTooltip(label);
  }
  return () => map.remove();
}
