/* SMART HSR municipal weather chip — public forecast, Preview only.
 * Same-origin API proxy with provider attribution (MET Norway, CC BY 4.0).
 * Never requests GPS or a logged-in employee's token. All non-pilot
 * municipalities display "غير متاح" instead of another city's weather.
 */
(function () {
  'use strict';
  const CACHE_KEY = 'smart-hsr:municipal-weather:alqunfudhah:v1';
  const CACHE_MS = 30 * 60 * 1000;
  const API_URL = '/api/organization/context?weather=alqunfudhah';
  const CITY_PATTERN = /القنفذة|al[\s-]*qunfudhah|al[\s-]*qunfu(?:d|dh)ah/i;
  let request = null;
  let lastResult = null;
  let lastLoaded = 0;


  function pilotCity(label) {
    return typeof label === 'string' && CITY_PATTERN.test(label);
  }

  function valid(value) {
    const t = Date.parse(value?.forecastAt || '');
    return value && value.city === 'القنفذة' && value.source === 'MET Norway'
      && value.observed === false && Number.isInteger(value.forecastTemperatureC)
      && value.forecastTemperatureC >= -80 && value.forecastTemperatureC <= 65
      && Number.isFinite(t) && Math.abs(t - Date.now()) < 4 * 60 * 60 * 1000;
  }

  function eligible(chip) {
    const selector = chip.getAttribute('data-hsr-weather-org-selector');
    const name = selector ? document.querySelector(selector)?.textContent?.trim() : '';
    return pilotCity(name);
  }

  function render(chip, data) {
    const target = chip.querySelector('[data-hsr-weather-status]');
    if (!target) return;
    const good = valid(data);
    const label = good ? 'توقع ' + data.forecastTemperatureC + '°م · ' + data.description : 'غير متاح';
    if (target.textContent !== label) target.textContent = label;
    const credit = chip.querySelector('[data-hsr-weather-credit]');
    if (credit) {
      credit.hidden = !good;
      // CC BY 4.0 requires a license link and notice of adaptations.
      // Reuse the original source link and attach one discreet license link.
      let license = chip.querySelector('[data-hsr-weather-license]');
      if (!license) {
        license = document.createElement('a');
        license.dataset.hsrWeatherLicense = '1';
        license.href = 'https://creativecommons.org/licenses/by/4.0/';
        license.target = '_blank';
        license.rel = 'noopener noreferrer';
        license.textContent = 'CC BY 4.0';
        license.setAttribute('aria-label', 'رخصة بيانات الطقس CC BY 4.0');
        Object.assign(license.style, {
          fontSize: '8px', whiteSpace: 'nowrap', color: 'inherit',
          textDecoration: 'underline', textUnderlineOffset: '2px'
        });
        credit.insertAdjacentElement('afterend', license);
      }
      license.hidden = !good;
    }
    const title = good
      ? 'توقع الطقس في القنفذة · MET Norway · ' + data.forecastAt
        + ' · تم تقريب الحرارة وترجمة الوصف إلى العربية · ليس قياسًا مباشرًا أو تحذيرًا رسميًا'
      : 'لا تتوفر توقعات موثوقة حاليًا لهذه الجهة';
    if (chip.title !== title) chip.title = title;
    if (chip.getAttribute('aria-label') !== title) chip.setAttribute('aria-label', title);
  }

  function readCache() {
    try {
      const record = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (!record || typeof record.storedAt !== 'number'
        || Date.now() - record.storedAt >= CACHE_MS || !valid(record.data)) return null;
      return record;
    } catch (_) { return null; }
  }

  function saveCache(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ storedAt: Date.now(), data })); }
    catch (_) { /* Browser storage is optional. */ }
  }

  async function getForecast() {
    if (request) return request;
    request = (async () => {
      const response = await fetch(API_URL, {
        // Vercel-protected Preview requires its same-origin session cookie; never send credentials cross-origin.
        method: 'GET', credentials: 'same-origin', cache: 'default'
      });
      if (!response.ok) throw new Error('weather_unavailable');
      const result = await response.json();
      if (!valid(result)) throw new Error('weather_invalid');
      saveCache(result);
      lastResult = result;
      lastLoaded = Date.now();
      return result;
    })().finally(() => { request = null; });
    return request;
  }

  async function refresh() {
    const chips = Array.from(document.querySelectorAll('[data-hsr-weather]'));
    const authorizedChips = chips.filter(eligible);
    chips.filter(chip => !eligible(chip)).forEach(chip => render(chip, null));
    if (!authorizedChips.length || document.hidden) return;
    const local = readCache();
    if (local) {
      lastResult = local.data;
      lastLoaded = local.storedAt;
    }
    if (lastResult && Date.now() - lastLoaded < CACHE_MS && valid(lastResult)) {
      authorizedChips.forEach(chip => render(chip, lastResult));
      return;
    }
    try {
      const result = await getForecast();
      authorizedChips.filter(eligible).forEach(chip => render(chip, result));
    } catch (_) {
      authorizedChips.filter(eligible).forEach(chip => render(chip, null));
    }
  }

  function start() {
    // The municipal identity can load after initial render. A low-cost DOM
    // probe keeps the city label and weather chip synchronized on re-login
    // or page restoration; refresh() only calls the API once per cache window.
    void refresh();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void refresh();
    });
    setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15 * 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
