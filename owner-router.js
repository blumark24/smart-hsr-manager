// Minimal hash router for the Owner Command Center shell.
//
// Presentational only: it shows/hides pre-rendered module containers by
// route and marks the matching sidebar link active. It does not fetch
// data, call Firebase, or own any business logic — every module's existing
// data-loading and event wiring is untouched and keeps running exactly as
// it did before routing was introduced.

export const ROUTES = Object.freeze([
  '/overview',
  '/organizations',
  '/users',
  '/subscriptions',
  '/ai',
  '/audit',
  '/security',
  '/reports',
  '/integrations',
  '/health',
]);

export const DEFAULT_ROUTE = '/overview';

function normalizeHash(hash) {
  const value = String(hash || '').replace(/^#/, '');
  return value.startsWith('/') ? value : '';
}

function resolveRoute() {
  const requested = normalizeHash(window.location.hash);
  return ROUTES.includes(requested) ? requested : DEFAULT_ROUTE;
}

export function createOwnerRouter({ onRouteChange } = {}) {
  function applyRoute() {
    const route = resolveRoute();
    document.querySelectorAll('[data-route]').forEach((el) => {
      el.classList.toggle('hidden', el.dataset.route !== route);
    });
    document.querySelectorAll('[data-route-link]').forEach((link) => {
      link.classList.toggle('sidebar-link-active', link.dataset.routeLink === route);
    });
    if (typeof onRouteChange === 'function') onRouteChange(route);
  }

  function start() {
    if (resolveRoute() !== normalizeHash(window.location.hash)) {
      window.location.hash = '#' + DEFAULT_ROUTE;
    }
    window.addEventListener('hashchange', applyRoute);
    applyRoute();
  }

  function navigate(route) {
    if (!ROUTES.includes(route)) return;
    window.location.hash = '#' + route;
  }

  return Object.freeze({ start, navigate, getCurrentRoute: resolveRoute });
}
