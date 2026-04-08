/* ==========================================================================
   StudyHub — 4plan import view
   ========================================================================== */

import { saveStudyPlan, getStudyPlan, importFourPlanCourses, setActiveSemesterNumber, setActiveSemesterLabel } from '../store.js';
import { parseFourPlanJSON, semesterNumberToAcademic, detectCurrentSemester } from '../utils/fourplan-import.js';
import { navigate } from '../router.js';

/** @type {Array|null} Cached catalog for enriching codes. */
let catalogCache = null;

async function loadCatalog() {
  if (catalogCache) return catalogCache;
  try {
    const resp = await fetch('data/fis-courses-AI-2025.json');
    catalogCache = await resp.json();
  } catch {
    catalogCache = [];
  }
  return catalogCache;
}

/**
 * Enrich parsed semesters with names/credits from catalog.
 * Mutates courses in place.
 */
function enrichFromCatalog(semesters, catalog) {
  for (const sem of semesters) {
    for (const course of sem.courses) {
      if (course.name && course.credits) continue;
      const match = catalog.find(c => c.code && c.code.toUpperCase() === course.code.toUpperCase());
      if (match) {
        if (!course.name) course.name = match.name || '';
        if (!course.credits) course.credits = match.credits || 0;
      }
    }
  }
}

const GROUP_LABELS = {
  povinny: 'Povinný',
  'povinne-volitelny': 'Povinně volitelný',
  volitelny: 'Volitelný',
};

/**
 * Render the 4plan import view.
 * @param {HTMLElement} container
 */
export function renderFourPlanImport(container) {
  const existingPlan = getStudyPlan();

  container.innerHTML = `
    <div class="fourplan">
      <h2 class="section-title"><span class="accent">Import</span> studijního plánu</h2>
      <p class="text-muted mb-6">Importuj studijní plán z 4plan (JSON formát). Předměty budou automaticky přidány do příslušných semestrů.</p>

      ${existingPlan.importedAt ? `
        <div class="alert alert--info mb-6">
          Studijní plán již importován${existingPlan.programName ? ` (${escHtml(existingPlan.programName)})` : ''}.
          Nový import nahradí stávající plán.
        </div>
      ` : ''}

      <div class="card mb-6">
        <h3 class="form-section__title">1. Nahrát JSON</h3>
        <div class="form-field">
          <label class="form-label">Rok nástupu do studia</label>
          <input class="input" id="fp-start-year" type="number" min="2015" max="2030"
            value="${existingPlan.startYear || new Date().getFullYear() - 1}" placeholder="2024"
            style="max-width: 120px">
        </div>

        <div class="form-field mt-4">
          <label class="form-label">JSON soubor z 4plan</label>
          <input type="file" id="fp-file" accept=".json,application/json" class="input">
        </div>

        <div class="form-field mt-4">
          <label class="form-label">Nebo vlož JSON přímo</label>
          <textarea class="textarea" id="fp-json" rows="6" placeholder='[{"semester":1,"courses":[{"code":"4IT115","name":"...","credits":6}]}]'></textarea>
        </div>

        <button class="btn btn--primary mt-4" id="fp-parse">Načíst plán</button>
        <div id="fp-error" class="mt-2"></div>
      </div>

      <div id="fp-preview" style="display:none">
        <div class="card mb-6">
          <h3 class="form-section__title">2. Náhled plánu</h3>
          <div id="fp-preview-content"></div>
        </div>

        <div class="card mb-6">
          <h3 class="form-section__title">3. Importovat předměty</h3>
          <p class="text-sm text-muted mb-3">Vyber semestr(y) k importu. Předměty, které už existují (stejný kód + semestr), budou přeskočeny.</p>

          <div id="fp-semester-checks" class="mb-4"></div>

          <button class="btn btn--primary" id="fp-import">Importovat vybrané semestry</button>
          <div id="fp-result" class="mt-3"></div>
        </div>
      </div>

      <a href="#/" class="btn btn--outline mt-4">← Zpět na přehled</a>
    </div>
  `;

  bindImport(container);
}

/** @type {{ semesters: Array, totalCredits: number, programName: string }|null} */
let parsed = null;

function bindImport(container) {
  const fileInput = container.querySelector('#fp-file');
  const jsonArea = container.querySelector('#fp-json');
  const parseBtn = container.querySelector('#fp-parse');
  const errorEl = container.querySelector('#fp-error');

  // File upload fills the textarea
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { jsonArea.value = reader.result; };
    reader.readAsText(file);
  });

  parseBtn.addEventListener('click', async () => {
    errorEl.innerHTML = '';
    const jsonStr = jsonArea.value.trim();
    if (!jsonStr) {
      errorEl.innerHTML = '<div class="alert alert--error">Vlož JSON data nebo nahraj soubor.</div>';
      return;
    }

    try {
      parsed = parseFourPlanJSON(jsonStr);
    } catch (err) {
      errorEl.innerHTML = `<div class="alert alert--error">Chyba při parsování: ${escHtml(err.message)}</div>`;
      return;
    }

    if (parsed.semesters.length === 0) {
      errorEl.innerHTML = '<div class="alert alert--error">Nebyl nalezen žádný semestr v datech.</div>';
      return;
    }

    // Enrich from catalog
    const catalog = await loadCatalog();
    enrichFromCatalog(parsed.semesters, catalog);

    // Recalculate totalCredits after enrichment
    parsed.totalCredits = parsed.semesters.reduce(
      (sum, s) => sum + s.courses.reduce((cs, c) => cs + (c.credits || 0), 0), 0
    );

    renderPreview(container, parsed);
  });
}

function renderPreview(container, data) {
  const preview = container.querySelector('#fp-preview');
  const content = container.querySelector('#fp-preview-content');
  const checksEl = container.querySelector('#fp-semester-checks');
  const startYear = container.querySelector('#fp-start-year').value;

  preview.style.display = '';

  // Detect current semester
  const currentSem = detectCurrentSemester(startYear);

  // Render preview table
  let html = '';
  if (data.programName) {
    html += `<p class="text-sm mb-3"><strong>Program:</strong> ${escHtml(data.programName)}</p>`;
  }
  html += `<p class="text-sm text-muted mb-3">Celkem ${data.totalCredits} kreditů v ${data.semesters.length} semestrech</p>`;

  for (const sem of data.semesters) {
    const label = semesterNumberToAcademic(sem.number, startYear);
    const isCurrent = sem.number === currentSem;
    const semCredits = sem.courses.reduce((s, c) => s + (c.credits || 0), 0);

    html += `
      <div class="fp-semester ${isCurrent ? 'fp-semester--current' : ''}">
        <div class="fp-semester__header">
          <span class="fp-semester__label">${sem.number}. semestr — ${label}</span>
          ${isCurrent ? '<span class="badge badge--rel">Aktuální</span>' : ''}
          <span class="text-sm text-muted">${sem.courses.length} předmětů, ${semCredits} kr.</span>
        </div>
        <div class="fp-semester__courses">
          ${sem.courses.map(c => `
            <div class="fp-course">
              <span class="mono text-teal">${escHtml(c.code)}</span>
              <span>${c.name ? escHtml(c.name) : '<span class="text-muted">—</span>'}</span>
              ${c.credits ? `<span class="badge badge--credit" style="width:22px;height:22px;font-size:11px">${c.credits}</span>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  content.innerHTML = html;

  // Render semester checkboxes
  checksEl.innerHTML = data.semesters.map(sem => {
    const label = semesterNumberToAcademic(sem.number, startYear);
    const isCurrent = sem.number === currentSem;
    return `
      <label class="fp-check">
        <input type="checkbox" value="${sem.number}" ${isCurrent ? 'checked' : ''}>
        ${sem.number}. sem — ${label} (${sem.courses.length} předmětů)
      </label>
    `;
  }).join('');

  // Import button
  const importBtn = container.querySelector('#fp-import');
  const resultEl = container.querySelector('#fp-result');

  importBtn.addEventListener('click', () => {
    const startYearVal = container.querySelector('#fp-start-year').value;
    const checked = [...checksEl.querySelectorAll('input:checked')].map(el => Number(el.value));

    if (checked.length === 0) {
      resultEl.innerHTML = '<div class="alert alert--error">Vyber alespoň jeden semestr.</div>';
      return;
    }

    // Save study plan
    saveStudyPlan({
      startYear: startYearVal,
      programName: data.programName,
      semesters: data.semesters,
    });

    // Import courses for selected semesters
    let totalAdded = 0;
    let totalSkipped = 0;

    for (const semNum of checked) {
      const sem = data.semesters.find(s => s.number === semNum);
      if (!sem) continue;
      const label = semesterNumberToAcademic(semNum, startYearVal);
      const { added, skipped } = importFourPlanCourses(sem.courses, label);
      totalAdded += added;
      totalSkipped += skipped;
    }

    // Auto-set active semester to current
    const detectedCurrent = detectCurrentSemester(startYearVal);
    if (checked.includes(detectedCurrent)) {
      setActiveSemesterNumber(detectedCurrent);
      setActiveSemesterLabel(semesterNumberToAcademic(detectedCurrent, startYearVal));
    }

    resultEl.innerHTML = `
      <div class="alert alert--ok">
        Import dokončen: ${totalAdded} předmětů přidáno${totalSkipped > 0 ? `, ${totalSkipped} přeskočeno (již existují)` : ''}.
      </div>
    `;

    importBtn.disabled = true;
    importBtn.textContent = 'Importováno ✓';
  });
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
