/* ==========================================================================
   StudyHub — Course form (add / edit)
   ========================================================================== */

import { getCourse, saveCourse, deleteCourse } from '../store.js';
import { navigate } from '../router.js';
import { renderAIParserSection, bindAIParser, renderAISummaryButton, bindAISummary } from './ai-parser.js';
import { isSupabaseConfigured, fetchSharedCourse, submitSharedCourse } from '../utils/supabase.js';

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

const SCHEDULE_TYPES = [
  { value: 'lecture', label: 'Přednáška' },
  { value: 'seminar', label: 'Cvičení' },
  { value: 'lab',     label: 'Laboratoř' },
  { value: 'other',   label: 'Jiné' },
];

const DAYS = ['Po', 'Út', 'St', 'Čt', 'Pá'];

const GRADING_TEMPLATES = {
  vse: [
    { grade: '1', label: 'Výborně', minPercent: 90 },
    { grade: '2', label: 'Velmi dobře', minPercent: 75 },
    { grade: '3', label: 'Dobře', minPercent: 60 },
    { grade: '4', label: 'Nevyhověl', minPercent: 0 },
  ],
  points: [
    { grade: '1', label: 'Výborně', minPercent: 90 },
    { grade: '2', label: 'Velmi dobře', minPercent: 80 },
    { grade: '3', label: 'Dobře', minPercent: 70 },
    { grade: '4', label: 'Nevyhověl', minPercent: 0 },
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
    description: '',
    aiSummary: '',
    learningOutcomes: [],
    weeklyTopics: Array.from({ length: 13 }, (_, i) => ({ week: i + 1, topic: '' })),
    components: [],
    events: [],
    requirements: [],
    workload: { lectures: '', seminars: '', project: '', testPrep: '', examPrep: '' },
    gradingTemplate: 'vse',
    gradingScale: structuredClone(GRADING_TEMPLATES.vse),
    schedule: [],
    literature: { required: [], recommended: [] },
    allLecturers: [],
    notes: '',
  };
}

function courseToForm(c) {
  // Ensure 13 weekly topic rows
  const topics = Array.from({ length: 13 }, (_, i) => {
    const existing = (c.weeklyTopics || []).find(t => t.week === i + 1);
    return { week: i + 1, topic: existing ? existing.topic : '' };
  });

  return {
    id: c.id,
    code: c.code || '',
    name: c.name || '',
    credits: c.credits ?? '',
    group: c.group || '',
    semester: c.semester || SEMESTERS[1],
    lecturer: c.lecturer || '',
    insisUrl: c.insisUrl || '',
    description: c.description || '',
    aiSummary: c.aiSummary || '',
    learningOutcomes: [...(c.learningOutcomes || [])],
    weeklyTopics: topics,
    components: (c.components || []).map(x => ({ ...x })),
    events: (c.events || []).map(x => ({ ...x })),
    requirements: [...(c.requirements || [])],
    workload: {
      lectures: c.workload?.lectures ?? '',
      seminars: c.workload?.seminars ?? '',
      project: c.workload?.project ?? '',
      testPrep: c.workload?.testPrep ?? '',
      examPrep: c.workload?.examPrep ?? '',
    },
    gradingTemplate: 'custom',
    gradingScale: (c.gradingScale || []).map(x => ({ ...x })),
    schedule: (c.schedule || []).map(x => ({ ...x })),
    literature: {
      required: [...(c.literature?.required || [])],
      recommended: [...(c.literature?.recommended || [])],
    },
    allLecturers: [...(c.allLecturers || [])],
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
  const wl = form.workload;
  const workloadTotal = (Number(wl.lectures) || 0) + (Number(wl.seminars) || 0) +
    (Number(wl.project) || 0) + (Number(wl.testPrep) || 0) + (Number(wl.examPrep) || 0);

  wrapper.innerHTML = `
    <div class="form-header">
      <h2 class="section-title">${isEdit ? 'Upravit' : 'Přidat'} <span class="accent">předmět</span></h2>
    </div>

    ${!isEdit ? renderAIParserSection() : ''}

    <!-- SHARED COURSE ALERT -->
    <div id="shared-course-alert"></div>

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

    <!-- CONTENT -->
    <section class="form-section">
      <h3 class="form-section__title">Obsah předmětu</h3>

      <div class="form-field">
        <label class="form-label">Zaměření / popis</label>
        <textarea class="textarea" id="f-description" rows="3" placeholder="Stručný popis zaměření předmětu…">${escHtml(form.description)}</textarea>
      </div>

      <div class="form-field">
        <label class="form-label">AI shrnutí pro studenty <span class="text-muted text-sm">(volitelné)</span></label>
        <textarea class="textarea" id="f-ai-summary" rows="2" placeholder="Krátký popis srozumitelný studentům…">${escHtml(form.aiSummary || '')}</textarea>
        ${renderAISummaryButton()}
      </div>

      <div class="form-field">
        <label class="form-label">Výsledky učení</label>
        <div id="outcome-list">${form.learningOutcomes.map((o, i) => renderOutcomeRow(o, i)).join('')}</div>
        <button class="btn btn--outline mt-2" id="btn-add-outcome">+ Přidat výsledek</button>
      </div>

      <div class="form-field">
        <label class="form-label">Obsah po týdnech</label>
        <div class="weekly-topics-grid" id="weekly-topics">
          ${form.weeklyTopics.map((t, i) => `
            <div class="weekly-topic-row">
              <span class="weekly-topic-row__week mono text-muted">${t.week}.</span>
              <input class="input" data-week-idx="${i}" value="${escHtml(t.topic)}" placeholder="Téma ${t.week}. týdne">
            </div>
          `).join('')}
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

    <!-- WORKLOAD -->
    <section class="form-section">
      <h3 class="form-section__title">Studijní zátěž <span class="text-muted text-sm">(hodiny za semestr)</span></h3>
      <div class="form-row">
        <div class="form-field form-field--sm">
          <label class="form-label">Přednášky</label>
          <input class="input" id="f-wl-lectures" type="number" min="0" value="${wl.lectures}">
        </div>
        <div class="form-field form-field--sm">
          <label class="form-label">Cvičení</label>
          <input class="input" id="f-wl-seminars" type="number" min="0" value="${wl.seminars}">
        </div>
        <div class="form-field form-field--sm">
          <label class="form-label">Projekt</label>
          <input class="input" id="f-wl-project" type="number" min="0" value="${wl.project}">
        </div>
        <div class="form-field form-field--sm">
          <label class="form-label">Příprava na testy</label>
          <input class="input" id="f-wl-testprep" type="number" min="0" value="${wl.testPrep}">
        </div>
        <div class="form-field form-field--sm">
          <label class="form-label">Příprava na zk.</label>
          <input class="input" id="f-wl-examprep" type="number" min="0" value="${wl.examPrep}">
        </div>
      </div>
      <p class="text-sm text-muted" id="workload-total">Celkem: ${workloadTotal} h</p>
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
            <span class="grade-edit-cell__label text-sm text-muted">${g.label || ''}</span>
            <input class="input grade-edit-cell__input" type="number" min="0" max="100"
              value="${g.minPercent}" data-grade-idx="${i}"
              ${form.gradingTemplate !== 'custom' ? 'disabled' : ''}>
            <span class="text-sm text-muted">%</span>
          </div>
        `).join('')}
      </div>
    </section>

    <!-- SCHEDULE -->
    <section class="form-section">
      <h3 class="form-section__title">Rozvrh</h3>
      <div id="schedule-list">${form.schedule.map((s, i) => renderScheduleRow(s, i)).join('')}</div>
      <button class="btn btn--outline mt-3" id="btn-add-schedule">+ Přidat rozvrhovou akci</button>
    </section>

    <!-- LITERATURE -->
    <section class="form-section">
      <h3 class="form-section__title">Literatura</h3>
      <div class="form-field">
        <label class="form-label">Povinná</label>
        <div id="lit-required-list">${form.literature.required.map((l, i) => renderLitRow(l, i, 'required')).join('')}</div>
        <button class="btn btn--outline mt-2" id="btn-add-lit-req">+ Přidat</button>
      </div>
      <div class="form-field">
        <label class="form-label">Doporučená</label>
        <div id="lit-recommended-list">${form.literature.recommended.map((l, i) => renderLitRow(l, i, 'recommended')).join('')}</div>
        <button class="btn btn--outline mt-2" id="btn-add-lit-rec">+ Přidat</button>
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
      ${isSupabaseConfigured() ? '<button class="btn btn--outline" id="btn-share">Sdílet pro ostatní</button>' : ''}
    </div>

    <div class="form-errors" id="form-errors"></div>
  `;

  bindEvents(wrapper, catalog, isEdit);

  // AI parser integration (new forms only)
  if (!isEdit) {
    bindAIParser(wrapper, (data) => {
      if (data.code) form.code = data.code;
      if (data.name) form.name = data.name;
      if (data.credits) form.credits = data.credits;
      if (data.group) form.group = data.group;
      if (data.lecturer) form.lecturer = data.lecturer;
      if (data.description) form.description = data.description;
      if (Array.isArray(data.learningOutcomes) && data.learningOutcomes.length) form.learningOutcomes = data.learningOutcomes;
      if (Array.isArray(data.weeklyTopics) && data.weeklyTopics.length) {
        form.weeklyTopics = Array.from({ length: 13 }, (_, i) => {
          const existing = data.weeklyTopics.find(t => t.week === i + 1);
          return { week: i + 1, topic: existing ? existing.topic : '' };
        });
      }
      if (Array.isArray(data.components) && data.components.length) form.components = data.components;
      if (Array.isArray(data.events) && data.events.length) {
        form.events = data.events.map(e => ({
          id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
          registered: false, ...e,
        }));
      }
      if (Array.isArray(data.requirements) && data.requirements.length) form.requirements = data.requirements;
      if (data.workload) form.workload = { ...form.workload, ...data.workload };
      if (Array.isArray(data.gradingScale) && data.gradingScale.length) {
        form.gradingScale = data.gradingScale;
        form.gradingTemplate = 'custom';
      }
      if (Array.isArray(data.schedule) && data.schedule.length) form.schedule = data.schedule;
      if (data.literature) {
        if (Array.isArray(data.literature.required)) form.literature.required = data.literature.required;
        if (Array.isArray(data.literature.recommended)) form.literature.recommended = data.literature.recommended;
      }
      if (data.notes) form.notes = data.notes;
      render(wrapper, catalog, isEdit);
    });
  }

  // AI summary generator
  bindAISummary(wrapper, () => {
    syncFormFromDom(wrapper);
    return {
      name: form.name,
      description: form.description,
      weeklyTopics: form.weeklyTopics,
    };
  }, (summary) => {
    form.aiSummary = summary;
    const el = wrapper.querySelector('#f-ai-summary');
    if (el) el.value = summary;
  });
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

function renderOutcomeRow(text, idx) {
  return `
    <div class="dyn-row dyn-row--simple" data-outcome-idx="${idx}">
      <input class="input" data-outcome="text" value="${escHtml(text)}" placeholder="Výsledek učení…">
      <button class="btn-icon btn-icon--delete" data-delete-outcome="${idx}" title="Smazat">×</button>
    </div>
  `;
}

function renderScheduleRow(s, idx) {
  const dayOptions = DAYS.map(d =>
    `<option value="${d}" ${d === s.day ? 'selected' : ''}>${d}</option>`
  ).join('');
  const typeOptions = SCHEDULE_TYPES.map(t =>
    `<option value="${t.value}" ${t.value === s.type ? 'selected' : ''}>${t.label}</option>`
  ).join('');

  return `
    <div class="dyn-row" data-sched-idx="${idx}">
      <div class="dyn-row__fields">
        <div class="form-field form-field--xs">
          <select class="select" data-sched="day">${dayOptions}</select>
        </div>
        <div class="form-field form-field--sm">
          <input class="input" data-sched="time" value="${escHtml(s.time || '')}" placeholder="09:15-10:45">
        </div>
        <div class="form-field form-field--sm">
          <input class="input" data-sched="room" value="${escHtml(s.room || '')}" placeholder="SB 110">
        </div>
        <div class="form-field form-field--sm">
          <select class="select" data-sched="type">${typeOptions}</select>
        </div>
        <div class="form-field">
          <input class="input" data-sched="teacher" value="${escHtml(s.teacher || '')}" placeholder="Vyučující">
        </div>
        <div class="form-field form-field--xs">
          <input class="input" data-sched="capacity" type="number" min="0" value="${s.capacity ?? ''}" placeholder="Kap.">
        </div>
      </div>
      <div class="dyn-row__bottom">
        <span></span>
        <button class="btn-icon btn-icon--delete" data-delete-sched="${idx}" title="Smazat">×</button>
      </div>
    </div>
  `;
}

function renderLitRow(text, idx, kind) {
  return `
    <div class="dyn-row dyn-row--simple" data-lit-idx="${idx}" data-lit-kind="${kind}">
      <input class="input" data-lit="text" value="${escHtml(text)}" placeholder="Autor, název, rok…">
      <button class="btn-icon btn-icon--delete" data-delete-lit="${idx}" data-delete-lit-kind="${kind}" title="Smazat">×</button>
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

  // Close dropdown on outside click
  if (bindEvents._docClickHandler) {
    document.removeEventListener('click', bindEvents._docClickHandler);
  }
  bindEvents._docClickHandler = (e) => {
    if (!document.contains(catInput)) {
      document.removeEventListener('click', bindEvents._docClickHandler);
      return;
    }
    if (!catInput.contains(e.target) && !catDrop.contains(e.target)) {
      catDrop.classList.remove('catalog-dropdown--open');
    }
  };
  document.addEventListener('click', bindEvents._docClickHandler);

  catDrop.addEventListener('click', (e) => {
    const item = e.target.closest('[data-cat-idx]');
    if (!item) return;
    const idx = Number(item.dataset.catIdx);
    if (idx === -1) {
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
      checkSharedCourse(wrapper, c.code, form.semester, catalog, isEdit);
    }
    catDrop.classList.remove('catalog-dropdown--open');
    wrapper.querySelector('#f-code').focus();
  });

  // Helper for add/delete dynamic rows
  const rerender = () => render(wrapper, catalog, isEdit);

  // Add dynamic rows
  wrapper.querySelector('#btn-add-comp').addEventListener('click', () => {
    syncFormFromDom(wrapper);
    form.components.push({ name: '', type: 'test', weight: '', description: '', maxScore: '', passingScore: '' });
    rerender();
  });

  wrapper.querySelector('#btn-add-event').addEventListener('click', () => {
    syncFormFromDom(wrapper);
    form.events.push({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), title: '', type: 'test', date: '', time: '', location: '', notes: '', registered: false });
    rerender();
  });

  wrapper.querySelector('#btn-add-req').addEventListener('click', () => {
    syncFormFromDom(wrapper);
    form.requirements.push('');
    rerender();
  });

  wrapper.querySelector('#btn-add-outcome').addEventListener('click', () => {
    syncFormFromDom(wrapper);
    form.learningOutcomes.push('');
    rerender();
  });

  wrapper.querySelector('#btn-add-schedule').addEventListener('click', () => {
    syncFormFromDom(wrapper);
    form.schedule.push({ day: 'Po', time: '', room: '', type: 'lecture', teacher: '', capacity: '' });
    rerender();
  });

  wrapper.querySelector('#btn-add-lit-req').addEventListener('click', () => {
    syncFormFromDom(wrapper);
    form.literature.required.push('');
    rerender();
  });

  wrapper.querySelector('#btn-add-lit-rec').addEventListener('click', () => {
    syncFormFromDom(wrapper);
    form.literature.recommended.push('');
    rerender();
  });

  // Delete handlers
  wrapper.querySelectorAll('[data-delete-comp]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncFormFromDom(wrapper);
      form.components.splice(Number(btn.dataset.deleteComp), 1);
      rerender();
    });
  });

  wrapper.querySelectorAll('[data-delete-event]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncFormFromDom(wrapper);
      form.events.splice(Number(btn.dataset.deleteEvent), 1);
      rerender();
    });
  });

  wrapper.querySelectorAll('[data-delete-req]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncFormFromDom(wrapper);
      form.requirements.splice(Number(btn.dataset.deleteReq), 1);
      rerender();
    });
  });

  wrapper.querySelectorAll('[data-delete-outcome]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncFormFromDom(wrapper);
      form.learningOutcomes.splice(Number(btn.dataset.deleteOutcome), 1);
      rerender();
    });
  });

  wrapper.querySelectorAll('[data-delete-sched]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncFormFromDom(wrapper);
      form.schedule.splice(Number(btn.dataset.deleteSched), 1);
      rerender();
    });
  });

  wrapper.querySelectorAll('[data-delete-lit]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncFormFromDom(wrapper);
      const kind = btn.dataset.deleteLitKind;
      form.literature[kind].splice(Number(btn.dataset.deleteLit), 1);
      rerender();
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

  // Workload live total
  ['#f-wl-lectures', '#f-wl-seminars', '#f-wl-project', '#f-wl-testprep', '#f-wl-examprep'].forEach(sel => {
    const el = wrapper.querySelector(sel);
    if (el) {
      el.addEventListener('input', () => {
        syncFormFromDom(wrapper);
        const wl = form.workload;
        const total = (Number(wl.lectures) || 0) + (Number(wl.seminars) || 0) +
          (Number(wl.project) || 0) + (Number(wl.testPrep) || 0) + (Number(wl.examPrep) || 0);
        wrapper.querySelector('#workload-total').textContent = `Celkem: ${total} h`;
      });
    }
  });

  // Grading template change
  wrapper.querySelector('#f-grading-tpl').addEventListener('change', (e) => {
    syncFormFromDom(wrapper);
    form.gradingTemplate = e.target.value;
    if (form.gradingTemplate !== 'custom') {
      form.gradingScale = structuredClone(GRADING_TEMPLATES[form.gradingTemplate]);
    }
    rerender();
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

  // Share to Supabase
  const shareBtn = wrapper.querySelector('#btn-share');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      syncFormFromDom(wrapper);
      const errors = validate();
      if (errors.length) {
        const errorsEl = wrapper.querySelector('#form-errors');
        errorsEl.innerHTML = errors.map(e => `<div class="alert alert--error mb-2">${e}</div>`).join('');
        errorsEl.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      if (!confirm('Tvá data budou anonymně sdílena a zkontrolována adminem. Pokračovat?')) return;
      shareBtn.disabled = true;
      shareBtn.textContent = 'Odesílám…';
      try {
        await submitSharedCourse(formToCourse());
        shareBtn.textContent = 'Odesláno!';
      } catch {
        shareBtn.textContent = 'Sdílet pro ostatní';
        shareBtn.disabled = false;
      }
    });
  }
}

// ── Supabase shared course check ─────────────────────────────────────────────

async function checkSharedCourse(wrapper, code, semester, catalog, isEdit) {
  if (!isSupabaseConfigured() || !code) return;

  const alertEl = wrapper.querySelector('#shared-course-alert');
  if (!alertEl) return;

  try {
    const shared = await fetchSharedCourse(code, semester);
    if (!shared || !shared.data) {
      alertEl.innerHTML = '';
      return;
    }

    alertEl.innerHTML = `
      <div class="alert alert--info mb-4">
        <div class="shared-alert">
          <div>
            <strong>Tento předmět má předvyplněná data od komunity</strong>
            <p class="text-sm text-muted mt-1">Klikni pro předvyplnění formuláře. Můžeš pak cokoliv upravit.</p>
          </div>
          <button class="btn btn--primary btn--sm" id="btn-use-shared">Použít předvyplněná data</button>
        </div>
      </div>
    `;

    wrapper.querySelector('#btn-use-shared').addEventListener('click', () => {
      const courseData = shared.data;
      // Merge shared data into form via courseToForm
      const merged = courseToForm({ ...courseData, id: form.id });
      Object.assign(form, merged);
      alertEl.innerHTML = '<div class="alert alert--ok mb-4">Data byla předvyplněna. Zkontroluj a uprav formulář.</div>';
      render(wrapper, catalog, isEdit);
    });
  } catch {
    // Silent fail — offline-first
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
  const creditsVal = wrapper.querySelector('#f-credits')?.value;
  form.credits = creditsVal !== '' ? Number(creditsVal) : '';
  form.semester = wrapper.querySelector('#f-semester')?.value || '';
  form.lecturer = wrapper.querySelector('#f-lecturer')?.value || '';
  form.insisUrl = wrapper.querySelector('#f-insis')?.value || '';
  form.description = wrapper.querySelector('#f-description')?.value || '';
  form.aiSummary = wrapper.querySelector('#f-ai-summary')?.value || '';
  form.notes = wrapper.querySelector('#f-notes')?.value || '';

  // Learning outcomes
  wrapper.querySelectorAll('[data-outcome-idx]').forEach((row, i) => {
    form.learningOutcomes[i] = row.querySelector('[data-outcome="text"]')?.value || '';
  });

  // Weekly topics
  wrapper.querySelectorAll('[data-week-idx]').forEach(input => {
    const idx = Number(input.dataset.weekIdx);
    if (form.weeklyTopics[idx]) {
      form.weeklyTopics[idx].topic = input.value || '';
    }
  });

  // Components
  wrapper.querySelectorAll('[data-comp-idx]').forEach((row, i) => {
    if (!form.components[i]) return;
    form.components[i].name = row.querySelector('[data-comp="name"]')?.value || '';
    form.components[i].type = row.querySelector('[data-comp="type"]')?.value || 'other';
    const wVal = row.querySelector('[data-comp="weight"]')?.value;
    form.components[i].weight = wVal !== '' ? Number(wVal) : '';
    const msVal = row.querySelector('[data-comp="maxScore"]')?.value;
    form.components[i].maxScore = msVal !== '' ? Number(msVal) : '';
    const psVal = row.querySelector('[data-comp="passingScore"]')?.value;
    form.components[i].passingScore = psVal !== '' ? Number(psVal) : '';
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

  // Workload
  const wlFields = { lectures: '#f-wl-lectures', seminars: '#f-wl-seminars', project: '#f-wl-project', testPrep: '#f-wl-testprep', examPrep: '#f-wl-examprep' };
  for (const [key, sel] of Object.entries(wlFields)) {
    const val = wrapper.querySelector(sel)?.value;
    form.workload[key] = val !== '' ? Number(val) : '';
  }

  // Schedule
  wrapper.querySelectorAll('[data-sched-idx]').forEach((row, i) => {
    if (!form.schedule[i]) return;
    form.schedule[i].day = row.querySelector('[data-sched="day"]')?.value || 'Po';
    form.schedule[i].time = row.querySelector('[data-sched="time"]')?.value || '';
    form.schedule[i].room = row.querySelector('[data-sched="room"]')?.value || '';
    form.schedule[i].type = row.querySelector('[data-sched="type"]')?.value || 'lecture';
    form.schedule[i].teacher = row.querySelector('[data-sched="teacher"]')?.value || '';
    const capVal = row.querySelector('[data-sched="capacity"]')?.value;
    form.schedule[i].capacity = capVal !== '' ? Number(capVal) : '';
  });

  // Literature
  wrapper.querySelectorAll('[data-lit-kind="required"][data-lit-idx]').forEach((row, i) => {
    form.literature.required[i] = row.querySelector('[data-lit="text"]')?.value || '';
  });
  wrapper.querySelectorAll('[data-lit-kind="recommended"][data-lit-idx]').forEach((row, i) => {
    form.literature.recommended[i] = row.querySelector('[data-lit="text"]')?.value || '';
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
  const wl = form.workload;
  const total = (Number(wl.lectures) || 0) + (Number(wl.seminars) || 0) +
    (Number(wl.project) || 0) + (Number(wl.testPrep) || 0) + (Number(wl.examPrep) || 0);

  // Collect unique lecturers from schedule + main lecturer
  const lecturers = new Set();
  if (form.lecturer.trim()) lecturers.add(form.lecturer.trim());
  form.schedule.forEach(s => { if (s.teacher?.trim()) lecturers.add(s.teacher.trim()); });

  return {
    id: form.id || null,
    code: form.code.trim(),
    name: form.name.trim(),
    credits: Number(form.credits) || 0,
    semester: form.semester,
    group: form.group || 'povinny',
    lecturer: form.lecturer.trim(),
    insisUrl: form.insisUrl.trim(),
    description: form.description.trim(),
    aiSummary: form.aiSummary.trim(),
    learningOutcomes: form.learningOutcomes.filter(o => o.trim()),
    weeklyTopics: form.weeklyTopics.filter(t => t.topic.trim()),
    components: form.components.map(c => ({
      name: c.name, type: c.type,
      weight: Number(c.weight) || 0,
      maxScore: c.maxScore !== '' ? Number(c.maxScore) : null,
      passingScore: c.passingScore !== '' ? Number(c.passingScore) : null,
      description: c.description || '',
    })),
    events: form.events.map(e => ({
      id: e.id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
      title: e.title, type: e.type, date: e.date,
      time: e.time || '', location: e.location || '',
      notes: e.notes || '', registered: e.registered || false,
    })),
    requirements: form.requirements.filter(r => r.trim()),
    workload: {
      lectures: Number(wl.lectures) || 0,
      seminars: Number(wl.seminars) || 0,
      project: Number(wl.project) || 0,
      testPrep: Number(wl.testPrep) || 0,
      examPrep: Number(wl.examPrep) || 0,
      total,
    },
    gradingScale: form.gradingScale,
    schedule: form.schedule.filter(s => s.time.trim()).map(s => ({
      day: s.day, time: s.time, room: s.room || '',
      type: s.type, teacher: s.teacher || '',
      frequency: 'každý', capacity: s.capacity !== '' ? Number(s.capacity) : null,
    })),
    literature: {
      required: form.literature.required.filter(l => l.trim()),
      recommended: form.literature.recommended.filter(l => l.trim()),
    },
    allLecturers: [...lecturers],
    notes: form.notes.trim(),
    source: 'local',
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
