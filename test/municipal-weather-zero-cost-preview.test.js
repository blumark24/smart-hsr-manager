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
  assert.match(source, /19\.1264/);
  assert.match(source, /41\.0789/);
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
  assert.match(source, /https:\/\/creativecommons\.org\/licenses\/by\/4\.0\//);
  assert.match(source, /data-hsr-weather-license/);
  assert.match(source, /تم تقريب الحرارة وترجمة الوصف/);
  assert.match(source, /'غير متاح'/);
  assert.doesNotMatch(source, /navigator\.geolocation|watchPosition|getCurrentPosition|firebase|user\.uid|Bearer |api\.met\.no/);
});

test('MET cache respects long Expires, short Expires and missing Expires', () => {
  const now = Date.parse('2026-10-27T18:00:00Z');
  const headers = expiry => ({get(name){return name==='expires'?expiry:null;}});
  assert.equal(weather.providerTtl(headers('Wed, 28 Oct 2026 06:00:00 GMT'),now),12*60*60*1000);
  assert.equal(weather.providerTtl(headers('Tue, 27 Oct 2026 18:15:00 GMT'),now),15*60*1000);
  assert.equal(weather.providerTtl(headers(null),now),60*60*1000);
  assert.equal(weather.providerTtl(headers('invalid'),now),60*60*1000);
});

test('MET provider forecast is refreshed from cached raw timeseries, 304 preserves raw data', async () => {
  const start = Date.parse('2026-10-27T18:00:00Z');
  let current = start;
  const times = ['2026-10-27T18:00:00Z','2026-10-28T00:00:00Z','2026-10-28T06:00:00Z'];
  const expiresFirst = 'Wed, 28 Oct 2026 02:00:00 GMT';
  const expiresSecond = 'Wed, 28 Oct 2026 10:00:00 GMT';
  const lastModified = 'Tue, 27 Oct 2026 17:30:00 GMT';
  const received = [];
  const headers = fields => ({get(k){return fields[k.toLowerCase()]??null;}});
  const fetchImpl = async (url,opts) => {
    received.push({url,opts});
    if (received.length === 1) return {
      ok:true,status:200,
      headers:headers({'expires':expiresFirst,'last-modified':lastModified}),
      async json(){return {properties:{timeseries:times.map((time,i)=>({
        time,data:{instant:{details:{air_temperature:34-3*i}},
          next_1_hours:{summary:{symbol_code:'clearsky_day'}}}
      }))}};}
    };
    if (received.length===2) return {
      ok:false,status:304,headers:headers({'expires':expiresSecond})
    };
    throw new Error('unexpected extra upstream request');
  };
  const args={fetchImpl,clock:()=>current};
  const a=await weather.getPublicForecast(args);
  assert.equal(a.forecastTemperatureC,34);
  current = start + 6*60*60*1000;
  const b=await weather.getPublicForecast(args);
  assert.equal(b.forecastTemperatureC,31);
  assert.equal(received.length,1,'must not re-fetch before Expires');
  current = start + 9*60*60*1000;
  const c=await weather.getPublicForecast(args);
  assert.equal(c.forecastTemperatureC,28);
  assert.equal(received.length,2);
  assert.equal(received[1].opts.headers['If-Modified-Since'],lastModified);
  current = start + 10*60*60*1000;
  const d=await weather.getPublicForecast(args);
  assert.equal(d.forecastTemperatureC,28);
  assert.equal(received.length,2,'304 must extend local cache lifetime');
  assert.match(received[0].url,/^https:\/\/api\.met\.no\/weatherapi\/locationforecast/);
  assert.equal(received[0].opts.method,'GET');
});

test('Cached time series exhaustion fails closed rather than seeking an early refresh', async () => {
  // The Node test loader resets the module cache to isolate module state.
  const modulePath=require.resolve('../platform/weather/met-public-forecast');
  delete require.cache[modulePath];
  const fresh=require(modulePath);
  const start=Date.parse('2026-10-27T18:00:00Z');
  let current=start;
  let requests=0;
  const fetchImpl=async()=>{requests++;return {
    ok:true,status:200,headers:{get(n){return n==='expires'?'Wed, 28 Oct 2026 06:00:00 GMT':null;}},
    async json(){return {properties:{timeseries:[{time:'2026-10-27T18:00:00Z',data:{instant:{details:{air_temperature:31}}}}]}}}
  }};
  await fresh.getPublicForecast({fetchImpl,clock:()=>current});
  current+=5*60*60*1000;
  await assert.rejects(fresh.getPublicForecast({fetchImpl,clock:()=>current}),/cached_forecast_outdated/);
  assert.equal(requests,1,'do not query MET before Expires just for a new hour');
});

test('Manager forecast appears in the header only, with the integration strip unchanged otherwise', () => {
  const manager = read('manager.html');
  const strip = manager.match(/<section class="hsr-integration-strip"[\s\S]*?<\/section>/);
  assert.ok(strip, 'existing integrations strip must remain visible');
  assert.doesNotMatch(strip[0], /الطقس\s*[·•]\s*غير متصل/, 'remove only the stale duplicate weather label');
  assert.match(strip[0], /الاتجاه الزمني · بيانات غير كافية/, 'preserve unrelated integration status');
  assert.match(manager, /data-hsr-weather-org-selector="\\[data-hsr-weather-org\\]"/);
  assert.match(manager, /smart-hsr-weather\\.js/);
});
