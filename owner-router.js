// Owner Command Center hash router.
// Core legacy modules remain pre-rendered in owner.html. Additive owner extensions
// are mounted here so the shell gains real routed modules without rewriting the
// large legacy document or disturbing its existing Firebase/business wiring.
import { ensureOwnerExtensions, onOwnerExtensionRoute } from './owner-extensions.js';

export const ROUTES = Object.freeze([
  '/overview',
  '/organizations',
  '/users',
  '/subscriptions',
  '/ai',
  '/support',
  '/accounts',
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
    Promise.resolve(onOwnerExtensionRoute(route)).catch((error) => {
      console.error('Owner extension route load failed', error);
    });
  }

  function start() {
    // Mount additive real modules before resolving the first route so direct
    // links such as #/support and #/accounts work on the initial page load.
    ensureOwnerExtensions();
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
