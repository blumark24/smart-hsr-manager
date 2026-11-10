export const statuses = Object.freeze({
  PENDING: "قيد الانتظار",
  IN_PROGRESS: "قيد المعالجة",
  PENDING_REVIEW: "بانتظار المراجعة",
  COMPLETED: "مكتمل",
});
export const routes = ["home", "tasks", "new", "statistics", "account", "map"];
export const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function coordinates(item) {
  const lat = item?.correctedLat,
    lng = item?.correctedLng;
  if (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  )
    return [lat, lng];
  const parts = item?.location?.split(",").map((s) => s.trim());
  if (parts?.length !== 2 || parts.some((s) => !s)) return null;
  const [a, b] = parts.map(Number);
  return Number.isFinite(a) &&
    Number.isFinite(b) &&
    Math.abs(a) <= 90 &&
    Math.abs(b) <= 180
    ? [a, b]
    : null;
}
export function validGPS(p, now = Date.now()) {
  return (
    !!p &&
    Number.isFinite(p.latitude) &&
    Math.abs(p.latitude) <= 90 &&
    Number.isFinite(p.longitude) &&
    Math.abs(p.longitude) <= 180 &&
    Number.isFinite(p.accuracy) &&
    p.accuracy > 0 &&
    p.accuracy <= 30 &&
    now - p.capturedAt <= 30000 &&
    p.capturedAt <= now + 10000 &&
    p.sampleCount >= 3 &&
    p.stable === true
  );
}
export function distance(position, item) {
  const c = coordinates(item);
  if (!position || !c) return null;
  const rad = (v) => (v * Math.PI) / 180,
    a = rad(c[0] - position.latitude),
    b = rad(c[1] - position.longitude);
  const h =
    Math.sin(a / 2) ** 2 +
    Math.cos(rad(position.latitude)) *
      Math.cos(rad(c[0])) *
      Math.sin(b / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}
export function canAttachAfter(item) {
  return (
    item.status !== "COMPLETED" &&
    !Object.hasOwn(item, "assignedContractorUid") &&
    !item.afterImagePath
  );
}
