/* ==========================================================================
   StudyHub — Main entry point
   ========================================================================== */

import { seedIfEmpty, deduplicateSharedCourses, getSettings, updateSettings, getActiveSemesterLabel, setActiveSemesterLabel, getAvailableSemesters } from './store.js';
import { onRouteChange, initRouter } from './router.js';
import { renderDashboard } from './components/dashboard.js';
import { renderCourseDetail } from './components/course-detail.js';
import { renderCourseForm } from './components/course-form.js';
import { renderCalendar } from './components/calendar.js';
import { renderPlanner } from './components/planner.js';
import { renderFourPlanImport } from './components/fourplan-import.js';
import { renderCatalog } from './components/catalog.js';
import { isSupabaseConfigured } from './utils/supabase.js';

const app = document.getElementById('app');

/** Map route names to navbar hrefs for active-link highlighting. */
const NAV_ROUTES = {
  'dashboard':     '#/',
  'calendar':      '#/calendar',
  'course-new':    '#/course/new',
  'planner':       '#/planner',
  'import':        '#/import',
  'browse':        '#/browse',
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

    case 'import':
      renderFourPlanImport(app);
      break;

    case 'browse':
      renderCatalog(app);
      break;

    default: {
      const title = 'Stránka nenalezena';
      app.innerHTML = `
        <h2 class="section-title"><span class="accent">${title}</span></h2>
        <div class="card mt-6">
          <p class="text-muted">Obsah se připravuje…</p>
        </div>
      `;
    }
  }
}

// ── Theme ───────────────────────────────────────────────────────────────────

function initTheme() {
  const settings = getSettings();
  let theme = settings.theme;

  if (!theme || theme === 'auto') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  applyTheme(theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  updateSettings({ theme: next });
}

// ── Semester bar ────────────────────────────────────────────────────────────

/**
 * Detect the current semester label based on today's date.
 * Sep–Jan → ZS YYYY/YY, Feb–Aug → LS YYYY/YY
 * @returns {string}
 */
function detectCurrentSemester() {
  const today = new Date();
  const month = today.getMonth() + 1; // 1–12
  const year = today.getFullYear();
  if (month >= 9) {
    return `ZS ${year}/${String(year + 1).slice(-2)}`;
  }
  return `LS ${year - 1}/${String(year).slice(-2)}`;
}

/** AbortController for the semester bar click listener — replaced on every re-render. */
let semBarAbort = null;

function renderSemesterBar() {
  const bar = document.getElementById('semester-bar');
  const tabsEl = document.getElementById('semester-tabs');
  if (!bar || !tabsEl) return;

  const semesters = getAvailableSemesters();

  if (semesters.length === 0) {
    bar.style.display = 'none';
    return;
  }

  // Auto-detect on first use (no saved preference yet)
  let active = getActiveSemesterLabel();
  if (active === null) {
    const detected = detectCurrentSemester();
    if (semesters.includes(detected)) {
      active = detected;
      setActiveSemesterLabel(active);
    }
  }

  bar.style.display = '';

  const tabs = [
    `<button class="semester-tab ${active === null ? 'semester-tab--active' : ''}" data-sem-label="all">Všechny semestry</button>`,
    ...semesters.map(s =>
      `<button class="semester-tab ${s === active ? 'semester-tab--active' : ''}" data-sem-label="${s}">${s}</button>`
    ),
  ];
  tabsEl.innerHTML = tabs.join('');

  // Replace listener cleanly on every re-render
  if (semBarAbort) semBarAbort.abort();
  semBarAbort = new AbortController();
  tabsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sem-label]');
    if (!btn) return;
    const val = btn.dataset.semLabel;
    setActiveSemesterLabel(val === 'all' ? null : val);
    renderSemesterBar();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }, { signal: semBarAbort.signal });
}

// ── Init ─────────────────────────────────────────────────────────────────────

seedIfEmpty();
deduplicateSharedCourses();
initTheme();
renderSemesterBar();

// Hide catalog link if Supabase is not configured
if (!isSupabaseConfigured()) {
  const catLink = document.querySelector('a[href="#/browse"]');
  if (catLink) catLink.style.display = 'none';
}

document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);

onRouteChange((match) => {
  renderRoute(match);
  renderSemesterBar();
});
initRouter();
