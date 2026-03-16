/* ==========================================================================
   StudyHub — Course form (add / edit)
   ========================================================================== */

import { getCourse, saveCourse, deleteCourse } from '../store.js';
import { navigate } from '../router.js';
import { renderAIParserSection, bindAIParser } from './ai-parser.js';

// ── Constants ────────────────────────────────────────────────────────────────

const SEMESTERS = ['ZS 2025/26', 'LS 2025/26', 'ZS 2026/27', 'LS 2026/27'];

const COMPONENT_TYPES = [
  { value: 'exam',       label: 'Zkouška' },
  { value: 'test',       label: 'Test' },
  { value: 'project',    label: 'Projekt' },
  { value: 'homework',   label: 'Domácí úloha' },
  { value: 'seminar',    label: 'Seminář' },
  { value: 'attendance', label: 'Docházka' },
  { value: 'other',      label: 'Jiné' },
];

const EVENT_TYPES = [
  { value: 'test',         label: 'Test' },
  { value: 'exam',         label: 'Zkouška' },
  { value: 'deadline',     label: 'Deadline' },
  { value: 'presentation', label: 'Prezentace' },
  { value: 'other',        label: 'Jiné' },
];

const NAME_SUGGESTIONS = [
  'Průběžný test', 'Závěrečná zkouška', 'Semestrální práce',
  'Domácí úlohy', 'Aktivita na cvičeních', 'Prezentace',
];

const GRADING_TEMPLATES = {
  vse:    [
    { grade: 'A', minPercent: 90 }, { grade: 'B', minPercent: 75 },
    { grade: 'C', minPercent: 65 }, { grade: 'D', minPercent: 55 },
    { grade: 'E', minPercent: 50 }, { grade: 'F', minPercent: 0 },
  ],
  points: [
    { grade: 'A', minPercent: 90 }, { grade: 'B', minPercent: 80 },
    { grade: 'C', minPercent: 70 }, { grade: 'D', minPercent: 60 },
    { grade: 'E', minPercent: 50 }, { grade: 'F', minPercent: 0 },
  ],
};

/** @type {Array|null} Cached catalog data. */
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

// ── State ────────────────────────────────────────────────────────────────────

let form = {};

function blankForm() {
  return {
    id: null,
    code: '', name: '', credits: '', group: '', semester: SEMESTERS[1],
    lecturer: '', insisUrl: '',
    components: [],
    events: [],
    requirements: [],
    gradingTemplate: 'vse',
    gradingScale: structuredClone(GRADING_TEMPLATES.vse),
    notes: '',
  };
}

function courseToForm(c) {
  return {
    id: c.id,
    code: c.code || '',
    name: c.name || '',
    credits: c.credits ?? '',
    group: c.group || '',
    semester: c.semester || SEMESTERS[1],
    lecturer: c.lecturer || '',
    insisUrl: c.insisUrl || '',
    components: (c.components || []).map(x => ({ ...x })),
    events: (c.events || []).map(x => ({ ...x })),
    requirements: [...(c.requirements || [])],
    gradingTemplate: 'custom',
    gradingScale: (c.gradingScale || []).map(x => ({ ...x })),
    notes: c.notes || '',
  };
}

// ── Main render ──────────────────────────────────────────────────────────────

/**
 * Render the course form.
 * @param {HTMLElement} container
 * @param {string} [courseId] - If provided, edit mode.
 */
export async function renderCourseForm(container, courseId) {
  const isEdit = !!courseId;
  if (isEdit) {
    const course = getCourse(courseId);
    if (!course) {
      container.innerHTML = `
        <div class="alert alert--error">Předmět nebyl nalezen.</div>
        <a href="#/" class="btn btn--outline mt-4">← Zpět</a>
      `;
      return;
    }
    form = courseToForm(course);
  } else {
    form = blankForm();
  }

  const catalog = await loadCatalog();
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'course-form';
  container.appendChild(wrapper);

  render(wrapper, catalog, isEdit);
}

function render(wrapper, catalog, isEdit) {
  const weightSum = form.components.reduce((s, c) => s + (Number(c.weight) || 0), 0);
  const weightOk = weightSum === 100;

  wrapper.innerHTML = `
    <div class="form-header">
      <h2 class="section-title">${isEdit ? 'Upravit' : 'Přidat'} <span class="accent">předmět</span></h2>
    </div>

    ${!isEdit ? renderAIParserSection() : ''}

    <!-- BASIC INFO -->
    <section class="form-section">
      <h3 class="form-section__title">Základní informace</h3>

      <div class="form-field">
        <label class="form-label">Předmět z katalogu FIS</label>
        <div class="catalog-search">
          <input class="input" id="catalog-input" type="text"
            placeholder="Hledat podle kódu nebo názvu…"
            value="${escHtml(form.code ? `${form.code} — ${form.name}` : '')}"
            autocomplete="off">
          <div class="catalog-dropdown" id="catalog-dropdown"></div>
        </div>
      </div>

      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Kód předmětu</label>
          <input class="input mono" id="f-code" value="${escHtml(form.code)}" placeholder="4IT115">
        </div>
        <div class="form-field">
          <label class="form-label">Název</label>
          <input class="input" id="f-name" value="${escHtml(form.name)}" placeholder="Softwarové inženýrství">
        </div>
        <div class="form-field form-field--sm">
          <label class="form-label">Kredity</label>
          <input class="input" id="f-credits" type="number" min="0" max="30" value="${form.credits}">
        </div>
      </div>

      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Semestr</label>
          <select class="select" id="f-semester">
            ${SEMESTERS.map(s => `<option value="${s}" ${s === form.semester ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="form-field">
          <label class="form-label">Vyučující</label>
          <input class="input" id="f-lecturer" value="${escHtml(form.lecturer)}" placeholder="Doc. Ing. Novák">
        </div>
        <div class="form-field">
          <label class="form-label">Odkaz InSIS <span class="text-muted text-sm">(volitelné)</span></label>
          <input class="input" id="f-insis" value="${escHtml(form.insisUrl)}" placeholder="https://insis.vse.cz/…">
        </div>
      </div>
    </section>

    <!-- COMPONENTS -->
    <section class="form-section">
      <div class="form-section__header">
        <h3 class="form-section__title">Složky hodnocení</h3>
        <span class="weight-sum ${weightOk ? 'weight-sum--ok' : 'weight-sum--warn'}">
          Součet vah: ${weightSum} %
        </span>
      </div>
      <div id="comp-list">${form.components.map((c, i) => renderComponentRow(c, i)).join('')}</div>
      <button class="btn btn--outline mt-3" id="btn-add-comp">+ Přidat složku</button>
    </section>

    <!-- EVENTS -->
    <section class="form-section">
      <h3 class="form-section__title">Termíny a události</h3>
      <div id="event-list">${form.events.map((e, i) => renderEventRow(e, i)).join('')}</div>
      <button class="btn btn--outline mt-3" id="btn-add-event">+ Přidat termín</button>
    </section>

    <!-- REQUIREMENTS -->
    <section class="form-section">
      <h3 class="form-section__title">Podmínky splnění</h3>
      <div id="req-list">${form.requirements.map((r, i) => renderReqRow(r, i)).join('')}</div>
      <button class="btn btn--outline mt-3" id="btn-add-req">+ Přidat podmínku</button>
    </section>

    <!-- GRADING SCALE -->
    <section class="form-section">
      <h3 class="form-section__title">Klasifikační stupnice</h3>
      <div class="form-field">
        <select class="select" id="f-grading-tpl" style="max-width:280px">
          <option value="vse" ${form.gradingTemplate === 'vse' ? 'selected' : ''}>Standardní VŠE</option>
          <option value="points" ${form.gradingTemplate === 'points' ? 'selected' : ''}>Bodová</option>
          <option value="custom" ${form.gradingTemplate === 'custom' ? 'selected' : ''}>Vlastní</option>
        </select>
      </div>
      <div class="grade-edit-grid" id="grade-grid">
        ${form.gradingScale.map((g, i) => `
          <div class="grade-edit-cell">
            <span class="grade-edit-cell__grade">${g.grade}</span>
            <input class="input grade-edit-cell__input" type="number" min="0" max="100"
              value="${g.minPercent}" data-grade-idx="${i}"
              ${form.gradingTemplate !== 'custom' ? 'disabled' : ''}>
            <span class="text-sm text-muted">%</span>
          </div>
        `).join('')}
      </div>
    </section>

    <!-- NOTES -->
    <section class="form-section">
      <h3 class="form-section__title">Poznámky</h3>
      <textarea class="textarea" id="f-notes" rows="3" placeholder="Volné poznámky…">${escHtml(form.notes)}</textarea>
    </section>

    <!-- ACTIONS -->
    <div class="form-actions">
      <div>
        <button class="btn btn--primary" id="btn-save">Uložit předmět</button>
        <button class="btn btn--outline" id="btn-cancel">Zrušit</button>
      </div>
      ${isEdit ? '<button class="btn btn--danger" id="btn-delete">Smazat předmět</button>' : ''}
    </div>

    <div class="form-errors" id="form-errors"></div>
  `;

  bindEvents(wrapper, catalog, isEdit);

  // AI parser integration (new forms only)
  if (!isEdit) {
    bindAIParser(wrapper, (data) => {
      // Merge AI data into form state
      if (data.code) form.code = data.code;
      if (data.name) form.name = data.name;
      if (data.credits) form.credits = data.credits;
      if (data.group) form.group = data.group;
      if (data.lecturer) form.lecturer = data.lecturer;
      if (Array.isArray(data.components) && data.components.length) form.components = data.components;
      if (Array.isArray(data.events) && data.events.length) {
        form.events = data.events.map(e => ({
          id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
          registered: false, ...e,
        }));
      }
      if (Array.isArray(data.requirements) && data.requirements.length) form.requirements = data.requirements;
      if (Array.isArray(data.gradingScale) && data.gradingScale.length) {
        form.gradingScale = data.gradingScale;
        form.gradingTemplate = 'custom';
      }
      if (data.notes) form.notes = data.notes;
      render(wrapper, catalog, isEdit);
    });
  }
}

// ── Dynamic row renderers ────────────────────────────────────────────────────

function renderComponentRow(c, idx) {
  const typeOptions = COMPONENT_TYPES.map(t =>
    `<option value="${t.value}" ${t.value === c.type ? 'selected' : ''}>${t.label}</option>`
  ).join('');

  const suggestionsId = `comp-suggestions-${idx}`;

  return `
    <div class="dyn-row" data-comp-idx="${idx}">
      <div class="dyn-row__fields">
        <div class="form-field">
          <input class="input" data-comp="name" value="${escHtml(c.name)}" placeholder="Název složky"
            list="${suggestionsId}" autocomplete="off">
          <datalist id="${suggestionsId}">
            ${NAME_SUGGESTIONS.map(s => `<option value="${s}">`).join('')}
          </datalist>
        </div>
        <div class="form-field form-field--sm">
          <select class="select" data-comp="type">${typeOptions}</select>
        </div>
        <div class="form-field form-field--xs">
          <input class="input" data-comp="weight" type="number" min="0" max="100" value="${c.weight ?? ''}" placeholder="%">
        </div>
        <div class="form-field form-field--xs">
          <input class="input" data-comp="maxScore" type="number" min="0" value="${c.maxScore ?? ''}" placeholder="Max b.">
        </div>
        <div class="form-field form-field--xs">
          <input class="input" data-comp="passingScore" type="number" min="0" value="${c.passingScore ?? ''}" placeholder="Min b.">
        </div>
      </div>
      <div class="dyn-row__bottom">
        <textarea class="textarea textarea--sm" data-comp="description" rows="1" placeholder="Popis (volitelný)">${escHtml(c.description || '')}</textarea>
        <button class="btn-icon btn-icon--delete" data-delete-comp="${idx}" title="Smazat">×</button>
      </div>
    </div>
  `;
}

function renderEventRow(e, idx) {
  const typeOptions = EVENT_TYPES.map(t =>
    `<option value="${t.value}" ${t.value === e.type ? 'selected' : ''}>${t.label}</option>`
  ).join('');

  return `
    <div class="dyn-row" data-event-idx="${idx}">
      <div class="dyn-row__fields">
        <div class="form-field">
          <input class="input" data-event="title" value="${escHtml(e.title || '')}" placeholder="Název">
        </div>
        <div class="form-field form-field--sm">
          <select class="select" data-event="type">${typeOptions}</select>
        </div>
        <div class="form-field form-field--sm">
          <input class="input" data-event="date" type="date" value="${e.date || ''}">
        </div>
        <div class="form-field form-field--xs">
          <input class="input" data-event="time" type="time" value="${e.time || ''}">
        </div>
        <div class="form-field form-field--xs">
          <input class="input" data-event="location" value="${escHtml(e.location || '')}" placeholder="Místo">
        </div>
      </div>
      <div class="dyn-row__bottom">
        <input class="input" data-event="notes" value="${escHtml(e.notes || '')}" placeholder="Poznámka (volitelná)">
        <button class="btn-icon btn-icon--delete" data-delete-event="${idx}" title="Smazat">×</button>
      </div>
    </div>
  `;
}

function renderReqRow(text, idx) {
  return `
    <div class="dyn-row dyn-row--simple" data-req-idx="${idx}">
      <input class="input" data-req="text" value="${escHtml(text)}" placeholder="Podmínka…">
      <button class="btn-icon btn-icon--delete" data-delete-req="${idx}" title="Smazat">×</button>
    </div>
  `;
}

// ── Event binding ────────────────────────────────────────────────────────────

function bindEvents(wrapper, catalog, isEdit) {
  // Catalog search
  const catInput = wrapper.querySelector('#catalog-input');
  const catDrop = wrapper.querySelector('#catalog-dropdown');

  catInput.addEventListener('focus', () => showCatalogResults(catInput, catDrop, catalog));
  catInput.addEventListener('input', () => showCatalogResults(catInput, catDrop, catalog));
  document.addEventListener('click', (e) => {
    if (!catInput.contains(e.target) && !catDrop.contains(e.target)) {
      catDrop.classList.remove('catalog-dropdown--open');
    }
  });

  catDrop.addEventListener('click', (e) => {
    const item = e.target.closest('[data-cat-idx]');
    if (!item) return;
    const idx = Number(item.dataset.catIdx);
    if (idx === -1) {
      // Custom course
      wrapper.querySelector('#f-code').value = '';
      wrapper.querySelector('#f-name').value = '';
      wrapper.querySelector('#f-credits').value = '';
      catInput.value = '';
    } else {
      const c = catalog[idx];
      wrapper.querySelector('#f-code').value = c.code;
      wrapper.querySelector('#f-name').value = c.name;
      wrapper.querySelector('#f-credits').value = c.credits;
      catInput.value = `${c.code} — ${c.name}`;
      syncFormFromDom(wrapper);
    }
    catDrop.classList.remove('catalog-dropdown--open');
    wrapper.querySelector('#f-code').focus();
  });

  // Add / remove dynamic rows
  wrapper.querySelector('#btn-add-comp').addEventListener('click', () => {
    syncFormFromDom(wrapper);
    form.components.push({ name: '', type: 'test', weight: '', description: '', maxScore: '', passingScore: '' });
    render(wrapper, catalog, isEdit);
  });

  wrapper.querySelector('#btn-add-event').addEventListener('click', () => {
    syncFormFromDom(wrapper);
    form.events.push({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), title: '', type: 'test', date: '', time: '', location: '', notes: '', registered: false });
    render(wrapper, catalog, isEdit);
  });

  wrapper.querySelector('#btn-add-req').addEventListener('click', () => {
    syncFormFromDom(wrapper);
    form.requirements.push('');
    render(wrapper, catalog, isEdit);
  });

  wrapper.querySelectorAll('[data-delete-comp]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncFormFromDom(wrapper);
      form.components.splice(Number(btn.dataset.deleteComp), 1);
      render(wrapper, catalog, isEdit);
    });
  });

  wrapper.querySelectorAll('[data-delete-event]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncFormFromDom(wrapper);
      form.events.splice(Number(btn.dataset.deleteEvent), 1);
      render(wrapper, catalog, isEdit);
    });
  });

  wrapper.querySelectorAll('[data-delete-req]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncFormFromDom(wrapper);
      form.requirements.splice(Number(btn.dataset.deleteReq), 1);
      render(wrapper, catalog, isEdit);
    });
  });

  // Weight sum live update
  wrapper.querySelectorAll('[data-comp="weight"]').forEach(input => {
    input.addEventListener('input', () => {
      syncFormFromDom(wrapper);
      const sum = form.components.reduce((s, c) => s + (Number(c.weight) || 0), 0);
      const sumEl = wrapper.querySelector('.weight-sum');
      sumEl.textContent = `Součet vah: ${sum} %`;
      sumEl.className = `weight-sum ${sum === 100 ? 'weight-sum--ok' : 'weight-sum--warn'}`;
    });
  });

  // Grading template change
  wrapper.querySelector('#f-grading-tpl').addEventListener('change', (e) => {
    syncFormFromDom(wrapper);
    form.gradingTemplate = e.target.value;
    if (form.gradingTemplate !== 'custom') {
      form.gradingScale = structuredClone(GRADING_TEMPLATES[form.gradingTemplate]);
    }
    render(wrapper, catalog, isEdit);
  });

  // Save
  wrapper.querySelector('#btn-save').addEventListener('click', () => {
    syncFormFromDom(wrapper);
    const errors = validate();
    const errorsEl = wrapper.querySelector('#form-errors');
    if (errors.length) {
      errorsEl.innerHTML = errors.map(e => `<div class="alert alert--error mb-2">${e}</div>`).join('');
      errorsEl.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const course = formToCourse();
    saveCourse(course);
    navigate(`#/course/${course.id}`);
  });

  // Cancel
  wrapper.querySelector('#btn-cancel').addEventListener('click', () => {
    navigate(isEdit ? `#/course/${form.id}` : '#/');
  });

  // Delete
  if (isEdit) {
    wrapper.querySelector('#btn-delete').addEventListener('click', () => {
      if (confirm('Opravdu smazat tento předmět? Tato akce je nevratná.')) {
        deleteCourse(form.id);
        navigate('#/');
      }
    });
  }
}

// ── Catalog dropdown ─────────────────────────────────────────────────────────

function showCatalogResults(input, dropdown, catalog) {
  const query = input.value.toLowerCase().trim();
  let results;

  if (query.length === 0) {
    results = catalog.slice(0, 15);
  } else {
    results = catalog.filter(c =>
      c.code.toLowerCase().includes(query) || c.name.toLowerCase().includes(query)
    ).slice(0, 15);
  }

  dropdown.innerHTML = `
    <div class="catalog-item catalog-item--custom" data-cat-idx="-1">
      <span class="text-muted">✎ Vlastní předmět (mimo katalog)</span>
    </div>
    ${results.map((c, i) => {
      const realIdx = catalog.indexOf(c);
      return `
        <div class="catalog-item" data-cat-idx="${realIdx}">
          <span class="mono text-teal">${c.code}</span>
          <span>${c.name}</span>
          <span class="badge badge--credit" style="width:22px;height:22px;font-size:11px">${c.credits}</span>
        </div>
      `;
    }).join('')}
  `;
  dropdown.classList.add('catalog-dropdown--open');
}

// ── Sync DOM → form state ────────────────────────────────────────────────────

function syncFormFromDom(wrapper) {
  form.code = wrapper.querySelector('#f-code')?.value || '';
  form.name = wrapper.querySelector('#f-name')?.value || '';
  form.credits = Number(wrapper.querySelector('#f-credits')?.value) || '';
  form.semester = wrapper.querySelector('#f-semester')?.value || '';
  form.lecturer = wrapper.querySelector('#f-lecturer')?.value || '';
  form.insisUrl = wrapper.querySelector('#f-insis')?.value || '';
  form.notes = wrapper.querySelector('#f-notes')?.value || '';

  // Components
  wrapper.querySelectorAll('[data-comp-idx]').forEach((row, i) => {
    if (!form.components[i]) return;
    form.components[i].name = row.querySelector('[data-comp="name"]')?.value || '';
    form.components[i].type = row.querySelector('[data-comp="type"]')?.value || 'other';
    form.components[i].weight = Number(row.querySelector('[data-comp="weight"]')?.value) || '';
    form.components[i].maxScore = Number(row.querySelector('[data-comp="maxScore"]')?.value) || '';
    form.components[i].passingScore = Number(row.querySelector('[data-comp="passingScore"]')?.value) || '';
    form.components[i].description = row.querySelector('[data-comp="description"]')?.value || '';
  });

  // Events
  wrapper.querySelectorAll('[data-event-idx]').forEach((row, i) => {
    if (!form.events[i]) return;
    form.events[i].title = row.querySelector('[data-event="title"]')?.value || '';
    form.events[i].type = row.querySelector('[data-event="type"]')?.value || 'other';
    form.events[i].date = row.querySelector('[data-event="date"]')?.value || '';
    form.events[i].time = row.querySelector('[data-event="time"]')?.value || '';
    form.events[i].location = row.querySelector('[data-event="location"]')?.value || '';
    form.events[i].notes = row.querySelector('[data-event="notes"]')?.value || '';
  });

  // Requirements
  wrapper.querySelectorAll('[data-req-idx]').forEach((row, i) => {
    form.requirements[i] = row.querySelector('[data-req="text"]')?.value || '';
  });

  // Grading
  form.gradingTemplate = wrapper.querySelector('#f-grading-tpl')?.value || 'vse';
  wrapper.querySelectorAll('[data-grade-idx]').forEach(input => {
    const idx = Number(input.dataset.gradeIdx);
    if (form.gradingScale[idx]) {
      form.gradingScale[idx].minPercent = Number(input.value) || 0;
    }
  });
}

// ── Validation ───────────────────────────────────────────────────────────────

function validate() {
  const errors = [];
  if (!form.name.trim()) errors.push('Název předmětu je povinný.');
  if (!form.code.trim()) errors.push('Kód předmětu je povinný.');
  if (form.components.length === 0) errors.push('Přidej alespoň jednu složku hodnocení.');
  return errors;
}

// ── Form → course object ────────────────────────────────────────────────────

function formToCourse() {
  return {
    id: form.id || null,
    code: form.code.trim(),
    name: form.name.trim(),
    credits: Number(form.credits) || 0,
    semester: form.semester,
    group: form.group || 'povinny',
    lecturer: form.lecturer.trim(),
    insisUrl: form.insisUrl.trim(),
    components: form.components.map(c => ({
      name: c.name, type: c.type,
      weight: Number(c.weight) || 0,
      maxScore: c.maxScore ? Number(c.maxScore) : null,
      passingScore: c.passingScore ? Number(c.passingScore) : null,
      description: c.description || '',
    })),
    events: form.events.map(e => ({
      id: e.id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
      title: e.title, type: e.type, date: e.date,
      time: e.time || '', location: e.location || '',
      notes: e.notes || '', registered: e.registered || false,
    })),
    requirements: form.requirements.filter(r => r.trim()),
    gradingScale: form.gradingScale,
    notes: form.notes.trim(),
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
