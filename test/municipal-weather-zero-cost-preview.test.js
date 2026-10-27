'use strict';
// Preview-only free-weather contract. No network, token, GPS or paid APIs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const weather = require('../platform/weather/met-public-forecast');

test('MET Norway license permits public pilot forecasts with explicit credit', () => {
  const now = Date.parse('2026-10-27T18:00:00Z');
  const result = weather.normalizeForecast({
    properties: {
      meta: { updated_at: '2026-10-27T17:30:00Z' },
      timeseries: [{
        time: '2026-10-27T18:00:00Z',
        data: {
          instant: { details: { air_temperature: 32.6 } },
          next_1_hours: { summary: { symbol_code: 'partlycloudy_day' } }
        }
      }]
    }
  }, now);
  assert.equal(result.city, 'القنفذة');
  assert.equal(result.forecastTemperatureC, 33);
  assert.equal(result.description, 'غائم جزئيًا');
  assert.equal(result.observed, false);
  assert.equal(result.source, 'MET Norway');
  assert.equal(result.license, 'CC BY 4.0');
  assert.match(result.sourceUrl, /^https:\/\/www\.met\.no\//);
});

test('Invalid, stale or unsupported weather data never produces a fake temperature', () => {
  const now = Date.parse('2026-10-27T18:00:00Z');
  const src = value => ({
    properties: {
      timeseries: [{
        time: '2026-10-27T18:00:00Z',
        data: { instant: { details: { air_temperature: value } } }
      }]
    }
  });
  for (const n of [null, 99, NaN, Infinity, '32', -100]) {
    assert.equal(weather.normalizeForecast(src(n), now), null, String(n));
  }
  assert.equal(weather.normalizeForecast({properties:{timeseries:[]}},now),null);
  assert.equal(weather.normalizeForecast({
    properties:{timeseries:[{time:'2026-10-26T09:00:00Z',data:{instant:{details:{air_temperature:30}}}}]}
  },now),null);
  assert.equal(weather.descriptionFor('heavyrain'), 'أمطار');
  assert.equal(weather.descriptionFor('fog'), 'ضباب');
});

test('Free public forecast uses a fixed city, a clear identity, and proper upstream cache', () => {
  const source = read('platform/weather/met-public-forecast.js');
  assert.match(source, /19\.12639/);
  assert.match(source, /41\.07889/);
  assert.match(source, /'User-Agent': 'SMART-HSR-Weather\/1\.0 /);
  assert.match(source, /'If-Modified-Since'/);
  assert.match(source, /response\.status === 304/);
  assert.match(source, /AbortSignal\.timeout\(3500\)/);
  assert.match(source, /if \(pending\) return pending/);
  assert.doesNotMatch(source, /Authorization|Bearer |geolocation|getCurrentPosition|localStorage/);
  const ms = weather.providerTtl({get(name){return name==='expires'
    ? 'Tue, 27 Oct 2026 20:00:00 GMT' : ''; }},Date.parse('2026-10-27T18:00:00Z'));
  assert.equal(ms,2*60*60*1000);
});

test('Backend weather action is fixed-location, preview only, and reuses an existing function', () => {
  const source = read('api/organization/context.js');
  assert.match(source, /process\.env\.VERCEL_ENV === 'production'/);
  assert.match(source, /weatherRequested !== 'alqunfudhah'/);
  assert.match(source, /'public, s-maxage=1800, stale-while-revalidate=1800'/);
  assert.match(source, /require\('\.\.\/\.\.\/platform\/weather\/met-public-forecast'\)/);
  assert.match(source, /weather_temporarily_unavailable/);
  assert.ok(source.indexOf('if (weatherRequested)') < source.indexOf('verifyRequestToken(req);', source.indexOf('async function handler(req, res)')));
  assert.equal(fs.existsSync(path.join(root, 'api/weather.js')), false);
});

test('Existing SMART HSR headers are retained; only the weather indicator is reused', () => {
  const head = read('department-head.html');
  const manager = read('manager.html');
  const lands = read('lands/index.html');
  assert.match(head, /class="dh-weather-chip" data-hsr-weather/);
  assert.match(head, /data-hsr-weather-org-selector="\.hsr-identity-org"/);
  assert.match(head, /data-smart-hsr-workspace-trigger/);
  assert.match(manager, /class="hsr-manager-header"/);
  assert.match(manager, /data-hsr-weather-org-selector="\[data-hsr-weather-org\]"/);
  assert.match(lands, /class="lands-head-weather" data-hsr-weather/);
  assert.match(lands, /data-hsr-weather-org-selector="#headerMunicipalityName"/);
  assert.match(lands, /id="accountMenu" class="account-menu"/);
  for (const source of [head,manager,lands]) {
    assert.match(source, /smart-hsr-weather\.js/);
    assert.match(source, /data-hsr-weather-credit[^>]*hidden|data-hsr-weather-credit hidden/);
  }
});

test('Browser weather code never uses device position or employees, and fails without a city match', () => {
  const source = read('smart-hsr-weather.js');
  assert.match(source, /CITY_PATTERN/);
  assert.match(source, /chips\.filter\(chip => !eligible\(chip\)\)/);
  assert.match(source, /data-hsr-weather-org-selector/);
  assert.match(source, /localStorage\.setItem\(CACHE_KEY/);
  assert.match(source, /CACHE_MS = 30 \* 60 \* 1000/);
  assert.match(source, /credentials: 'omit'/);
  assert.match(source, /'غير متاح'/);
  assert.doesNotMatch(source, /navigator\.geolocation|watchPosition|getCurrentPosition|firebase|user\.uid|Bearer |api\.met\.no/);
});
