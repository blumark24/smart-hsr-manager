import { distance } from "./domain.mjs";
import { fetchWithFirebaseAuth } from "../firebase-auth-fetch.js";
export function createServices(auth) {
  const controllers = new Set();
  async function request(url, body, method = body ? "POST" : "GET") {
    const user = auth.currentUser;
    const controller = new AbortController();
    controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetchWithFirebaseAuth({
        getIdToken: (force) => user.getIdToken(force),
        input: url,
        init: {
          method,
          cache: "no-store",
          signal: controller.signal,
          headers: body ? { "Content-Type": "application/json" } : {},
          body: body ? JSON.stringify(body) : undefined,
        },
      });
      const data = await response.json();
      if (!response.ok || data.ok === false)
        throw Object.assign(
          new Error(data.error || data.errorCode || "request_failed"),
          { status: response.status },
        );
      return data;
    } finally {
      clearTimeout(timer);
      controllers.delete(controller);
    }
  }
  return {
    request,
    cancel() {
      for (const c of controllers) c.abort();
      controllers.clear();
    },
    list: (cursor) =>
      request(
        "/api/inspector/observations" +
          (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""),
      ),
    summary: () => request("/api/inspector/observations?summary=1"),
    save: (draft) => request("/api/inspector/observations", draft),
    after: (body) => request("/api/inspector/observations", body, "PATCH"),
    analyze: (body) => request("/api/ai/analyze", body),
    async upload(file, observationId, scope = "before") {
      const blob = await compressImage(file);
      const dataBase64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onerror = reject;
        r.onload = () => resolve(r.result.split(",")[1]);
        r.readAsDataURL(blob);
      });
      const result = await request("/api/storage/upload", {
        contentType: blob.type,
        dataBase64,
        observationId,
        scope,
      });
      if (result.ok !== true || !result.objectKey)
        throw new Error("upload_unconfirmed");
      return result.objectKey;
    },
    async evidence(key) {
      const user = auth.currentUser;
      const controller = new AbortController();
      controllers.add(controller);
      const timer = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetchWithFirebaseAuth({
          getIdToken: (force) => user.getIdToken(force),
          input: "/api/storage/read?key=" + encodeURIComponent(key),
          init: { cache: "no-store", signal: controller.signal },
        });
        if (!response.ok) throw new Error("evidence_unavailable");
        return URL.createObjectURL(await response.blob());
      } finally {
        clearTimeout(timer);
        controllers.delete(controller);
      }
    },
  };
}
export async function compressImage(file) {
  if (
    !file ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 20 * 1024 * 1024
  )
    throw new Error("invalid_image");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 50e6) throw new Error("invalid_image");
    const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * ratio);
    canvas.height = Math.round(bitmap.height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.65, 0.45, 0.3]) {
      const blob = await new Promise((r) =>
        canvas.toBlob(r, "image/jpeg", quality),
      );
      if (blob && blob.size <= 700 * 1024) return blob;
    }
    throw new Error("image_too_large");
  } finally {
    bitmap.close();
  }
}
export function getGPS() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("gps_unavailable"));
    const samples = [];
    let stopped = false;
    const finish = (error, value) => {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", cancel);
      error ? reject(error) : resolve(value);
    };
    const cancel = () => finish(new Error("gps_cancelled"));
    const visibility = () => {
      if (document.hidden) cancel();
    };
    const timer = setTimeout(() => finish(new Error("gps_timeout")), 20000);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", cancel, { once: true });
    const capture = () =>
      navigator.geolocation.getCurrentPosition(
        (p) => {
          if (stopped) return;
          const sample = {
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
            accuracy: p.coords.accuracy,
            capturedAt: p.timestamp,
          };
          if (
            Number.isFinite(sample.accuracy) &&
            sample.accuracy > 0 &&
            sample.accuracy <= 30
          )
            samples.push(sample);
          if (samples.length >= 3) {
            const best = [...samples].sort(
              (a, b) => a.accuracy - b.accuracy,
            )[0];
            const stable =
              samples.filter(
                (s) =>
                  distance(s, {
                    correctedLat: best.latitude,
                    correctedLng: best.longitude,
                  }) <= Math.max(10, best.accuracy * 1.5),
              ).length >= 2;
            return finish(null, {
              ...best,
              sampleCount: samples.length,
              stable,
            });
          }
          // Sequential one-shot requests avoid persistent GPS watchers.
          setTimeout(() => {
            if (!stopped) capture();
          }, 300);
        },
        (error) => finish(error),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    capture();
  });
}
