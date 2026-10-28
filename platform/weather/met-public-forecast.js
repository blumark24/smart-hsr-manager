'use strict';

// Preview-only public forecast for the SMART HSR Al Qunfudhah pilot.
// Data from MET Norway (CC BY 4.0): https://api.met.no/
// Intentionally NOT a Vercel top-level /api function (the project has a cap).
// No GPS, employee token, user IP, tenant identifier or supplied URL is sent
// to the upstream weather provider.
const CITY = Object.freeze({
  key: 'alqunfudhah',
  label: 'القنفذة',
  latitude: 19.1264,
  longitude: 41.0789
});
const PROVIDER_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=19.1264&lon=41.0789';
const CREDIT_URL = 'https://www.met.no/en';
const FALLBACK_TTL_MS = 60 * 60 * 1000;
const MIN_TTL_MS = 30 * 60 * 1000;
const MAX_TTL_MS = 3 * 60 * 60 * 1000;
let cached = null;
let pending = null;
let lastModified = '';

const nowUtc = () => Date.now();

function descriptionFor(code) {
  if (typeof code !== 'string') return 'توقع جوي';
  const key = code.toLowerCase();
  if (key.includes('thunder')) return 'رعدية';
  if (key.includes('snow')) return 'ثلوج';
  if (key.includes('rain') || key.includes('sleet') || key.includes('drizzle')) return 'أمطار';
  if (key.includes('fog')) return 'ضباب';
  if (key.includes('partlycloudy')) return 'غائم جزئيًا';
  if (key.includes('cloudy')) return 'غائم';
  if (key.includes('clearsky') || key.includes('fair')) return 'صافٍ';
  return 'توقع جوي';
}

function normalizeForecast(data, currentMs) {
  const records = data?.properties?.timeseries;
  if (!Array.isArray(records) || !records.length) return null;
  // MET Locationforecast is a forecast, never claim this is a measured
  // temperature or an operational weather-warning feed.
  const item = records.find(entry => {
    const t = Date.parse(entry?.time || '');
    return Number.isFinite(t) && t >= currentMs - 60 * 60 * 1000 && t <= currentMs + 3 * 60 * 60 * 1000;
  });
  if (!item) return null;
  const value = item?.data?.instant?.details?.air_temperature;
  if (!Number.isFinite(value) || value < -80 || value > 65) return null;
  const symbol = item?.data?.next_1_hours?.summary?.symbol_code
    || item?.data?.next_6_hours?.summary?.symbol_code || '';
  const updated = Date.parse(data?.properties?.meta?.updated_at || '');
  return Object.freeze({
    city: CITY.label,
    forecastTemperatureC: Math.round(value),
    description: descriptionFor(symbol),
    forecastAt: new Date(item.time).toISOString(),
    updatedAt: Number.isFinite(updated) ? new Date(updated).toISOString() : null,
    observed: false,
    source: 'MET Norway',
    sourceUrl: CREDIT_URL,
    license: 'CC BY 4.0'
  });
}

function providerTtl(headers, currentMs) {
  const expiry = Date.parse(headers?.get?.('expires') || '');
  const requested = Number.isFinite(expiry) && expiry > currentMs ? expiry - currentMs : FALLBACK_TTL_MS;
  return requested;
}

async function getPublicForecast({ fetchImpl = fetch, clock = nowUtc } = {}) {
  if (cached && clock() < cached.expiresAt) return cached.value;
  if (pending) return pending;
  const task = async () => {
    const headers = {
      // MET requires identifiable clients. This public company address is
      // included only in the SERVER request; no employee identity is sent.
      'User-Agent': 'SMART-HSR-Weather/1.0 (https://blumark24.com)',
      'Accept': 'application/json'
    };
    if (lastModified) headers['If-Modified-Since'] = lastModified;
    const response = await fetchImpl(PROVIDER_URL, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(3500),
      redirect: 'error'
    });
    const now = clock();
    const expiresAt = now + providerTtl(response.headers, now);
    if (response.status === 304 && cached) {
      cached = { value: cached.value, expiresAt };
      return cached.value;
    }
    if (!response.ok) throw new Error('provider_unavailable');
    const parsed = normalizeForecast(await response.json(), now);
    if (!parsed) throw new Error('invalid_forecast');
    const m = response.headers?.get?.('last-modified');
    if (m && !Number.isNaN(Date.parse(m))) lastModified = m;
    cached = { value: parsed, expiresAt };
    return parsed;
  };
  pending = task().finally(() => { pending = null; });
  return pending;
}

module.exports = { CITY, getPublicForecast, normalizeForecast, descriptionFor, providerTtl };
