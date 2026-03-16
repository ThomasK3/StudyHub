/* ==========================================================================
   StudyHub — Hash-based router
   ========================================================================== */

/**
 * @typedef {object} RouteMatch
 * @property {string} route  - Matched route pattern (e.g. "course/:id")
 * @property {object} params - Parsed parameters (e.g. { id: "abc" })
 */

const ROUTES = [
  { pattern: '/',                name: 'dashboard' },
  { pattern: '/calendar',       name: 'calendar' },
  { pattern: '/course/new',     name: 'course-new' },
  { pattern: '/course/:id/edit', name: 'course-edit' },
  { pattern: '/course/:id',     name: 'course-detail' },
  { pattern: '/planner',        name: 'planner' },
];

/** @type {Function|null} */
let routeCallback = null;

/**
 * Parse the current hash and match against defined routes.
 * @param {string} hash
 * @returns {RouteMatch}
 */
function matchRoute(hash) {
  const path = hash.replace(/^#/, '') || '/';

  for (const route of ROUTES) {
    const paramNames = [];
    const regexStr = route.pattern.replace(/:(\w+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    const regex = new RegExp(`^${regexStr}$`);
    const match = path.match(regex);

    if (match) {
      const params = {};
      paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(match[i + 1]);
      });
      return { route: route.name, params };
    }
  }

  return { route: 'dashboard', params: {} };
}

/**
 * Register a callback invoked on every route change.
 * @param {function(RouteMatch): void} callback
 */
export function onRouteChange(callback) {
  routeCallback = callback;
}

/**
 * Navigate to a hash path.
 * @param {string} hash - e.g. "#/calendar" or "#/course/abc"
 */
export function navigate(hash) {
  window.location.hash = hash;
}

/**
 * Initialize the router — listen for hash changes and fire initial route.
 */
export function initRouter() {
  const handleChange = () => {
    const match = matchRoute(window.location.hash);
    if (routeCallback) routeCallback(match);
  };

  window.addEventListener('hashchange', handleChange);
  handleChange();
}
