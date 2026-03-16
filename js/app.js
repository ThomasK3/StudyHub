/* ==========================================================================
   StudyHub — Main entry point
   ========================================================================== */

import { seedIfEmpty } from './store.js';
import { onRouteChange, initRouter } from './router.js';
import { renderDashboard } from './components/dashboard.js';
import { renderCourseDetail } from './components/course-detail.js';
import { renderCourseForm } from './components/course-form.js';
import { renderCalendar } from './components/calendar.js';
import { renderPlanner } from './components/planner.js';

const app = document.getElementById('app');

/** Map route names to navbar hrefs for active-link highlighting. */
const NAV_ROUTES = {
  'dashboard':     '#/',
  'calendar':      '#/calendar',
  'course-new':    '#/course/new',
  'planner':       '#/planner',
};

/**
 * Update the active class on navbar links.
 * @param {string} routeName
 */
function updateActiveNav(routeName) {
  const links = document.querySelectorAll('.navbar__link');
  const activeHref = NAV_ROUTES[routeName] || null;

  links.forEach(link => {
    link.classList.toggle('navbar__link--active', link.getAttribute('href') === activeHref);
  });
}

/**
 * Render the appropriate view for each route.
 * @param {{ route: string, params: object }} match
 */
function renderRoute({ route, params }) {
  updateActiveNav(route);
  app.innerHTML = '';

  switch (route) {
    case 'dashboard':
      renderDashboard(app);
      break;

    case 'course-detail':
      renderCourseDetail(app, params.id);
      break;

    case 'course-new':
      renderCourseForm(app);
      break;

    case 'course-edit':
      renderCourseForm(app, params.id);
      break;

    case 'calendar':
      renderCalendar(app);
      break;

    case 'planner':
      renderPlanner(app);
      break;

    default: {
      const titles = {
        'course-new':  'Přidat předmět',
        'course-edit': 'Upravit předmět',
        'planner':     'Plánovač zkouškového',
      };
      const title = titles[route] || 'Stránka nenalezena';
      app.innerHTML = `
        <h2 class="section-title"><span class="accent">${title}</span></h2>
        <div class="card mt-6">
          <p class="text-muted">Obsah se připravuje…</p>
        </div>
      `;
    }
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────

seedIfEmpty();
onRouteChange(renderRoute);
initRouter();
