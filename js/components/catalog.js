/* ==========================================================================
   StudyHub — Catalog browse view (shared courses from Supabase)
   ========================================================================== */

import { isSupabaseConfigured, fetchSharedCourses } from '../utils/supabase.js';
import { getCourses, saveCourse } from '../store.js';
import { navigate } from '../router.js';

const SEMESTERS = ['LS 2025/26', 'ZS 2025/26', 'ZS 2026/27', 'LS 2026/27'];

const COMPONENT_TYPE_LABELS = {
  exam: 'Zkouška', test: 'Test', project: 'Projekt',
  homework: 'Domácí úloha', seminar: 'Seminář',
  attendance: 'Docházka', other: 'Jiné',
};

/** Debounce helper. */
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** @type {Array} Cached fetched courses. */
let allShared = [];

/** @type {AbortController|null} Cleans up the card-actions listener on each re-render. */
let bindAbortController = null;

/**
 * Render the catalog browse view.
 * @param {HTMLElement} container
 */
export async function renderCatalog(container) {
  if (!isSupabaseConfigured()) {
    container.innerHTML = `
      <h2 class="section-title"><span class="accent">Katalog</span> předmětů</h2>
      <div class="empty-state mt-6">
        <p>Katalog předmětů není dostupný offline.</p>
        <p class="mt-2">Předměty můžeš přidat <a href="#/course/new" class="text-teal" style="text-decoration:underline">ručně přes formulář</a>.</p>
      </div>
    `;
    return;
  }

  // Show loading skeleton
  container.innerHTML = `
    <h2 class="section-title"><span class="accent">Katalog</span> předmětů</h2>
    <div class="catalog-filters mt-4">
      <div class="catalog-filters__search">
        <input class="input catalog-filters__input" id="cat-search" type="text"
          placeholder="Hledat podle kódu nebo názvu…">
      </div>
      <select class="select catalog-filters__select" id="cat-semester">
        ${SEMESTERS.map((s, i) => `<option value="${s}" ${i === 0 ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
    </div>
    <p class="text-sm text-muted mt-2" id="cat-count"></p>
    <div class="catalog-grid mt-4" id="cat-grid">
      ${renderSkeletons(6)}
    </div>
  `;

  const searchInput = container.querySelector('#cat-search');
  const semesterSelect = container.querySelector('#cat-semester');
  const countEl = container.querySelector('#cat-count');
  const gridEl = container.querySelector('#cat-grid');

  // Fetch initial data
  await fetchAndRender(semesterSelect.value, searchInput.value, gridEl, countEl);

  // Live search (debounced)
  const update = debounce(() => {
    renderFiltered(searchInput.value, gridEl, countEl);
  }, 250);

  searchInput.addEventListener('input', update);

  // Semester change — re-fetch
  semesterSelect.addEventListener('change', async () => {
    gridEl.innerHTML = renderSkeletons(6);
    countEl.textContent = '';
    await fetchAndRender(semesterSelect.value, searchInput.value, gridEl, countEl);
  });
}

/**
 * Fetch courses from Supabase and render.
 */
async function fetchAndRender(semester, query, gridEl, countEl) {
  allShared = await fetchSharedCourses(semester);

  if (allShared.length === 0) {
    gridEl.innerHTML = `
      <div class="empty-state">
        <p>Pro tento semestr nejsou žádné předměty v databázi.</p>
      </div>
    `;
    countEl.textContent = '';
    return;
  }

  renderFiltered(query, gridEl, countEl);
}

/**
 * Filter cached courses and render cards.
 */
function renderFiltered(query, gridEl, countEl) {
  const q = query.toLowerCase().trim();
  const myCourses = getCourses();

  let filtered = allShared;
  if (q) {
    filtered = allShared.filter(sc =>
      (sc.code || '').toLowerCase().includes(q) ||
      (sc.data?.name || '').toLowerCase().includes(q)
    );
  }

  countEl.textContent = `Nalezeno ${filtered.length} předmětů`;

  if (filtered.length === 0) {
    gridEl.innerHTML = `
      <div class="empty-state">
        <p>Žádný předmět neodpovídá hledání.</p>
      </div>
    `;
    return;
  }

  gridEl.innerHTML = filtered.map(sc => renderCard(sc, myCourses)).join('');
  bindCardActions(gridEl);
}

/**
 * Check whether a shared catalog course is already in the user's library.
 * Uses String() coercion on sharedId to handle number/string mismatches from Supabase.
 * @param {object} sc - Shared course object (from Supabase)
 * @param {Array}  myCourses - User's saved courses
 * @returns {object|undefined} The matching local course, or undefined
 */
function findInLibrary(sc, myCourses) {
  const code = sc.code || (sc.data && sc.data.code) || '';
  return myCourses.find(c =>
    (c.sharedId != null && String(c.sharedId) === String(sc.id)) ||
    (c.code && c.code.toUpperCase() === code.toUpperCase() && c.semester === sc.semester)
  );
}

/**
 * Render a single catalog card.
 */
function renderCard(sc, myCourses) {
  const d = sc.data || {};
  const code = sc.code || d.code || '';
  const name = d.name || '';
  const credits = d.credits || 0;
  const aiSummary = d.aiSummary || sc.ai_summary || '';
  const lecturer = d.lecturer || '';
  const components = d.components || [];
  const schedule = d.schedule || [];

  const alreadyAdded = !!findInLibrary(sc, myCourses);

  // Schedule summary
  const schedCounts = {};
  for (const s of schedule) {
    const t = s.type || 'other';
    schedCounts[t] = (schedCounts[t] || 0) + 1;
  }
  const schedLabels = { lecture: 'přednáška', seminar: 'cvičení', lab: 'laboratoř' };
  const schedParts = Object.entries(schedCounts).map(([t, n]) => `${n} ${schedLabels[t] || t}`);

  return `
    <div class="cat-card" data-shared-id="${esc(sc.id)}" data-code="${esc(code)}">
      <div class="cat-card__header">
        <div class="cat-card__title-row">
          <span class="cat-card__code">${esc(code)}</span>
          <span class="cat-card__name">${esc(name)}</span>
        </div>
        ${credits ? `<span class="badge badge--credit">${credits}</span>` : ''}
      </div>

      ${aiSummary ? `<p class="cat-card__summary">${esc(truncate(aiSummary, 200))}</p>` : ''}

      ${lecturer ? `<p class="cat-card__lecturer text-sm text-muted">${esc(lecturer)}</p>` : ''}

      ${components.length ? `
        <div class="cat-card__components">
          ${components.map(c =>
            `<span class="cat-card__comp-tag">${esc(c.name || COMPONENT_TYPE_LABELS[c.type] || c.type)} ${c.weight ? c.weight + '%' : ''}</span>`
          ).join('')}
        </div>
      ` : ''}

      ${schedParts.length ? `<p class="cat-card__schedule text-xs text-muted">${schedParts.join(' · ')}</p>` : ''}

      <div class="cat-card__footer">
        ${alreadyAdded
          ? '<span class="cat-card__added text-muted text-sm">✓ Přidáno</span>'
          : `<button class="btn btn--primary btn--sm cat-card__add-btn" data-add-id="${esc(sc.id)}">+ Přidat do mých předmětů</button>`
        }
      </div>
    </div>
  `;
}

/**
 * Bind add-to-my-courses actions.
 * Uses AbortController so re-renders don't accumulate stale listeners.
 */
function bindCardActions(gridEl) {
  if (bindAbortController) bindAbortController.abort();
  bindAbortController = new AbortController();
  const { signal } = bindAbortController;

  gridEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-add-id]');
    if (!btn || btn.disabled) return;

    // Guard: btn may no longer be in the live DOM if a re-render raced this click
    const card = btn.closest('.cat-card');
    if (!card) return;
    const footer = card.querySelector('.cat-card__footer');
    if (!footer) return;

    const sharedId = btn.dataset.addId;
    const sc = allShared.find(s => String(s.id) === sharedId);
    if (!sc || !sc.data) return;

    const myCourses = getCourses();
    const code = sc.code || sc.data.code || '';
    const existing = findInLibrary(sc, myCourses);

    if (existing) {
      // Silently update existing — preserve notes, progress, id
      saveCourse({
        ...sc.data,
        id: existing.id,
        notes: existing.notes || sc.data.notes || '',
        progress: existing.progress,
        source: 'shared',
        sharedId: sc.id,
      });
    } else {
      saveCourse({
        ...sc.data,
        id: null,
        source: 'shared',
        sharedId: sc.id,
      });
    }

    footer.innerHTML = '<span class="cat-card__added text-muted text-sm">✓ Přidáno</span>';
    showToast(gridEl, `${code} přidán ✓`);
  }, { signal });
}

/**
 * Show a brief toast notification.
 */
function showToast(container, message) {
  let toast = document.querySelector('.cat-toast');
  if (toast) toast.remove();

  toast = document.createElement('div');
  toast.className = 'cat-toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('cat-toast--visible'));
  setTimeout(() => {
    toast.classList.remove('cat-toast--visible');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

function renderSkeletons(n) {
  return Array.from({ length: n }, () => `
    <div class="cat-card cat-card--skeleton">
      <div class="skeleton skeleton--line" style="width:40%"></div>
      <div class="skeleton skeleton--line" style="width:80%;margin-top:8px"></div>
      <div class="skeleton skeleton--line" style="width:60%;margin-top:8px"></div>
      <div class="skeleton skeleton--line" style="width:30%;margin-top:16px"></div>
    </div>
  `).join('');
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(str, max) {
  if (!str || str.length <= max) return str;
  return str.slice(0, max).replace(/\s+\S*$/, '') + '…';
}
