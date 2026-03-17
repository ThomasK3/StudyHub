/* ==========================================================================
   StudyHub — AI exam planner
   ========================================================================== */

import { getCourses, getSemester, getPlanner, updatePlanner } from '../store.js';
import { callAI, parseAIResponse, ensureApiKey } from '../utils/ai.js';
import { parseInsisExamPaste } from '../utils/insis-exams.js';
import { DAY_NAMES, formatDateCZ, daysUntil, getWeeksInRange } from '../utils/dates.js';

const EVENT_TYPE_COLORS = {
  exam: 'var(--color-red)', test: 'var(--color-amber)',
  deadline: 'var(--color-blue)', other: 'var(--color-muted)',
};

const SYSTEM_PROMPT = `Jsi studijní plánovač pro studenty VŠE v Praze. Na základě informací o předmětech, termínech zkoušek a preferencích studenta navrhni optimální plán zkouškového období.

Vrať POUZE platný JSON (bez komentářů, bez markdown) v tomto formátu:
{
  "plan": [
    {
      "courseCode": "4IT115",
      "courseName": "Softwarové inženýrství",
      "suggestedDate": "2026-05-25",
      "priority": "high",
      "reason": "Nejvyšší kredit, zkouška má váhu 40 %",
      "preparationTip": "Začni opakovat 10 dní předem, zaměř se na …"
    }
  ],
  "generalAdvice": "Celkový doporučený postup…",
  "warnings": [
    "Dvě zkoušky v jednom týdnu — 4IT115 a 4IZ110"
  ]
}

Pravidla:
- priority: "high" | "medium" | "low"
- Navrhni realistický plán — ne více než 1 zkouška za 2–3 dny
- Zohledni váhu kreditu (více kreditů = důležitější předmět)
- Zohledni preference studenta, pokud jsou uvedeny
- Varuj na konflikty (dvě zkoušky blízko sebe)
- Dávej konkrétní tipy na přípravu`;

/**
 * Render the planner view.
 * @param {HTMLElement} container
 */
export function renderPlanner(container) {
  const courses = getCourses();
  const semester = getSemester();
  const planner = getPlanner();

  container.innerHTML = `
    <div class="planner">
      <h2 class="section-title mb-6">Plánovač <span class="accent">zkouškového</span></h2>

      <!-- Import from InSIS -->
      <section class="form-section">
        <h3 class="form-section__title">Vložit termíny z InSIS</h3>
        <p class="text-sm text-muted mb-3">
          Zkopíruj tabulku termínů z InSIS a vlož ji sem. StudyHub z toho vytvoří možnosti termínů a zobrazí je v kalendáři zkouškového.
        </p>
        <textarea class="textarea" id="planner-raw" rows="8"
          placeholder="Vlož sem zkopírovaný výpis z InSIS…">${escapeHtml(planner.rawText || '')}</textarea>
        <div class="planner__import-actions mt-3">
          <button class="btn btn--outline btn--sm" id="btn-parse">Načíst termíny</button>
          <button class="btn btn--outline btn--sm" id="btn-parse-ai" title="Vyžaduje API klíč">Načíst termíny (AI)</button>
          <span class="text-sm text-muted" id="planner-parse-status"></span>
        </div>
      </section>

      <!-- Exam period calendar -->
      <section class="form-section">
        <h3 class="form-section__title">Kalendář zkouškového</h3>
        ${(!semester?.examStart || !semester?.examEnd)
          ? `<div class="alert alert--warning">Doplň zkouškové období v nastavení semestru (začátek a konec zkouškového).</div>`
          : `
            <div id="planner-calendar">
              ${renderExamCalendar(planner.terms || [], planner.selectedByCourse || {}, semester)}
            </div>
            <div id="planner-legend">
              ${renderSelectedLegend(planner.terms || [], planner.selectedByCourse || {}, courses)}
            </div>
          `}
      </section>

      <!-- Preferences -->
      <section class="form-section">
        <h3 class="form-section__title">Tvoje preference</h3>
        <textarea class="textarea" id="planner-prefs" rows="4"
          placeholder="Např.: Chtěl bych mít zkoušky co nejdříve. Matematiku bych raději nechal nakonec. V týdnu 25.5.–29.5. nemůžu."></textarea>
      </section>

      <!-- Generate -->
      <div class="mb-6">
        <button class="btn btn--primary" id="btn-generate">
          <span id="gen-text">Vygenerovat plán</span>
          <span id="gen-spinner" class="spinner" style="display:none"></span>
        </button>
      </div>

      <!-- Results -->
      <div id="planner-result"></div>
    </div>
  `;

  bindPlanner(container, courses, semester);
  bindImport(container, semester, courses);
  bindCalendarSelection(container, semester, courses);
}

function bindPlanner(container, courses, semester) {
  const btn = container.querySelector('#btn-generate');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const prefs = container.querySelector('#planner-prefs')?.value?.trim() || '';
    const resultEl = container.querySelector('#planner-result');
    const textEl = container.querySelector('#gen-text');
    const spinnerEl = container.querySelector('#gen-spinner');

    const hasKey = await ensureApiKey();
    if (!hasKey) return;

    // Build context
    const planner = getPlanner();
    const plannerTerms = Array.isArray(planner.terms) ? planner.terms : [];
    const plannerByCourse = groupTermsByCourse(plannerTerms);

    const baseCourses = Array.isArray(courses) ? courses : [];
    const effectiveCourses = baseCourses.length
      ? baseCourses
      : synthesizeCoursesFromTerms(plannerTerms);

    const courseSummary = effectiveCourses.map(c => {
      const examsFromCourse = (c.events || []).filter(e => e.type === 'exam').map(e => ({
        courseCode: c.code,
        courseName: c.name,
        date: e.date,
        time: e.time || '',
        location: e.location || '',
        typeLabel: e.title ? `zkouška (${e.title})` : 'zkouška',
      }));

      const examsFromPlanner = (plannerByCourse[c.code] || [])
        .filter(t => isExamLikeTerm(t))
        .map(t => ({
          courseCode: t.courseCode,
          courseName: t.courseName || c.name,
          date: t.date,
          time: t.time || '',
          location: t.location || '',
          typeLabel: t.typeLabel || '',
        }));

      const merged = dedupeExamLike(examsFromCourse.concat(examsFromPlanner));
      const comps = (c.components || []).map(comp => `${comp.name} (${comp.weight}%)`).join(', ');
      const termText = merged.length
        ? merged.map(t => `${t.typeLabel || 'termín'} ${t.date}${t.time ? ` ${t.time}` : ''}${t.location ? ` (${t.location})` : ''}`).join(', ')
        : 'žádné';
      const creditsText = (c.credits != null && c.credits !== '') ? `${c.credits} kr.` : '— kr.';
      return `- ${c.code} ${c.name} (${creditsText}): hodnocení: ${comps}. Zkouškové termíny: ${termText}`;
    }).join('\n');

    const semesterInfo = semester
      ? `Zkouškové období: ${semester.examStart} až ${semester.examEnd}`
      : '';

    const userPrompt = `Předměty studenta:\n${courseSummary}\n\n${semesterInfo}\n\nPreference studenta: ${prefs || 'žádné specifické'}`;

    // Loading
    btn.disabled = true;
    textEl.textContent = 'Generuji plán…';
    spinnerEl.style.display = '';
    resultEl.innerHTML = '';

    try {
      const response = await callAI(SYSTEM_PROMPT, userPrompt);
      const data = parseAIResponse(response);
      resultEl.innerHTML = renderPlanResult(data);
    } catch (err) {
      resultEl.innerHTML = `<div class="alert alert--error">${err.message}</div>`;
    } finally {
      btn.disabled = false;
      textEl.textContent = 'Vygenerovat plán';
      spinnerEl.style.display = 'none';
    }
  });
}

function bindImport(container, semester, courses) {
  const rawEl = container.querySelector('#planner-raw');
  const btnParse = container.querySelector('#btn-parse');
  const btnParseAI = container.querySelector('#btn-parse-ai');
  const statusEl = container.querySelector('#planner-parse-status');

  if (!rawEl || !btnParse || !btnParseAI || !statusEl) return;

  const refreshCalendar = () => {
    if (!semester?.examStart || !semester?.examEnd) return;
    const planner = getPlanner();
    const cal = container.querySelector('#planner-calendar');
    const legend = container.querySelector('#planner-legend');
    if (cal) cal.innerHTML = renderExamCalendar(planner.terms || [], planner.selectedByCourse || {}, semester);
    if (legend) legend.innerHTML = renderSelectedLegend(planner.terms || [], planner.selectedByCourse || {}, courses);
  };

  const updateStatus = (text) => { statusEl.textContent = text; };

  rawEl.addEventListener('input', () => {
    updatePlanner({ rawText: rawEl.value });
  });

  btnParse.addEventListener('click', () => {
    const text = rawEl.value || '';
    updatePlanner({ rawText: text });
    const { terms, errors } = parseInsisExamPaste(text);
    if (!terms.length) {
      updateStatus('Nenašel jsem žádné termíny. Zkus zkopírovat celý blok z InSIS.');
      return;
    }
    const selectedByCourse = normalizeSelection(getPlanner().selectedByCourse, terms);
    updatePlanner({ terms, selectedByCourse });
    updateStatus(errors.length ? `Načteno: ${terms.length} termínů (některé řádky se nepodařilo přečíst).` : `Načteno: ${terms.length} termínů.`);
    refreshCalendar();
  });

  btnParseAI.addEventListener('click', async () => {
    const text = rawEl.value || '';
    updatePlanner({ rawText: text });

    const hasKey = await ensureApiKey();
    if (!hasKey) return;

    updateStatus('Analyzuji AI…');
    btnParseAI.disabled = true;
    try {
      const response = await callAI(AI_PARSER_SYSTEM_PROMPT, buildAIParserUserPrompt(text));
      const data = parseAIResponse(response);
      const terms = normalizeParsedTerms(data);
      if (!terms.length) {
        updateStatus('AI nevrátila žádné termíny. Zkus vložit kratší text.');
        return;
      }
      const selectedByCourse = normalizeSelection(getPlanner().selectedByCourse, terms);
      updatePlanner({ terms, selectedByCourse });
      updateStatus(`Načteno (AI): ${terms.length} termínů.`);
      refreshCalendar();
    } catch {
      updateStatus('AI odpověď se nepodařilo zpracovat. Zkus vložit kratší text nebo rozdělit rozvrh zvlášť.');
    } finally {
      btnParseAI.disabled = false;
    }
  });
}

function bindCalendarSelection(container, semester, courses) {
  const cal = container.querySelector('#planner-calendar');
  if (!cal) return;

  const refresh = () => {
    if (!semester?.examStart || !semester?.examEnd) return;
    const planner = getPlanner();
    cal.innerHTML = renderExamCalendar(planner.terms || [], planner.selectedByCourse || {}, semester);
    const legend = container.querySelector('#planner-legend');
    if (legend) legend.innerHTML = renderSelectedLegend(planner.terms || [], planner.selectedByCourse || {}, courses);
  };

  cal.addEventListener('click', (e) => {
    const el = e.target.closest?.('[data-term-id]');
    if (!el) return;
    const termId = el.dataset.termId;
    const courseCode = el.dataset.courseCode;
    const termGroup = el.dataset.termGroup;
    if (!termId || !courseCode) return;

    const planner = getPlanner();
    const groupKey = termGroup || `${courseCode}|term`;
    const current = planner.selectedByCourse?.[groupKey] || null;
    const nextSelected = { ...(planner.selectedByCourse || {}) };
    if (current === termId) {
      delete nextSelected[groupKey];
    } else {
      nextSelected[groupKey] = termId;
    }
    updatePlanner({ selectedByCourse: nextSelected });
    refresh();
  });
}

function normalizeSelection(selectedByCourse, terms) {
  const validIds = new Set(terms.map(t => t.id));
  const next = {};
  const sel = selectedByCourse || {};
  for (const [key, id] of Object.entries(sel)) {
    if (validIds.has(id)) next[key] = id;
  }
  return next;
}

function renderSelectedLegend(terms, selectedByCourse, courses) {
  const byId = {};
  for (const t of (terms || [])) byId[t.id] = t;

  const creditsByCode = {};
  const nameByCode = {};
  for (const c of (courses || [])) {
    creditsByCode[c.code] = c.credits;
    nameByCode[c.code] = c.name;
  }

  const entries = Object.entries(selectedByCourse || {}).map(([key, id]) => {
    const t = byId[id];
    if (!t) return null;
    const code = (key.split('|')[0] || t.courseCode || '').trim();
    const typeGroup = (key.split('|').slice(1).join('|') || '').trim();
    return { key, code, typeGroup, term: t };
  }).filter(Boolean);

  if (!entries.length) {
    return '<p class="text-sm text-muted mb-0">Zatím nemáš vybraný žádný termín. Klikni na termín v kalendáři.</p>';
  }

  const items = entries
    .sort((a, b) => (a.code + a.typeGroup).localeCompare(b.code + b.typeGroup))
    .map(({ code, term }) => {
      const time = term.time ? ` ${term.time}` : '';
      const loc = term.location ? ` · ${escapeHtml(term.location)}` : '';
      const type = term.typeLabel ? ` · ${escapeHtml(term.typeLabel)}` : '';
      const rel = daysUntil(term.date);
      const credits = creditsByCode[code] != null ? `${creditsByCode[code]} kr.` : '';
      const courseName = escapeHtml(term.courseName || nameByCode[code] || '');
      return `
        <div class="planner-legend__item">
          <div class="planner-legend__top">
            <div class="planner-legend__title">
              <span class="mono text-teal">${escapeHtml(code)}</span>
              ${courseName ? `<span class="text-sm">${courseName}</span>` : ''}
            </div>
            <div class="planner-legend__badges">
              ${credits ? `<span class="badge badge--outline">${credits}</span>` : ''}
              <span class="badge badge--exam">${escapeHtml(rel)}</span>
            </div>
          </div>
          <div class="planner-legend__meta text-sm text-muted">
            <span>${formatDateCZ(term.date)}${time}${loc}${type}</span>
          </div>
        </div>
      `;
    })
    .join('');

  return `<div class="planner-legend">${items}</div>`;
}

function renderExamCalendar(terms, selectedByCourse, semester) {
  const weeks = getWeeksInRange(semester.examStart, semester.examEnd);
  const termsByDate = {};
  for (const t of (terms || [])) {
    if (!t.date) continue;
    (termsByDate[t.date] || (termsByDate[t.date] = [])).push(t);
  }

  const header = `
    <div class="planner-cal__header">
      ${DAY_NAMES.map(d => `<div class="planner-cal__day-header">${d}</div>`).join('')}
    </div>
  `;

  const rows = weeks.map(week => {
    const dayCells = week.days.map(day => {
      const dayTerms = termsByDate[day.isoDate] || [];
      const chips = dayTerms.map(t => renderTermChip(t, selectedByCourse)).join('');
      const classes = [
        'planner-cal__cell',
        day.inRange ? '' : 'planner-cal__cell--outside',
        day.isToday ? 'planner-cal__cell--today' : '',
      ].filter(Boolean).join(' ');

      return `
        <div class="${classes}">
          <div class="planner-cal__cell-top">
            <span class="planner-cal__num">${day.dayOfMonth}</span>
            ${week.weekLabel ? `<span class="planner-cal__wk">${week.weekLabel}</span>` : ''}
          </div>
          <div class="planner-cal__chips">${chips}</div>
        </div>
      `;
    }).join('');

    return `<div class="planner-cal__row">${dayCells}</div>`;
  }).join('');

  return `<div class="planner-cal">${header}${rows}</div>`;
}

function renderTermChip(term, selectedByCourse) {
  const groupKey = getTermGroupKey(term);
  const selectedId = selectedByCourse?.[groupKey] || null;
  const isSelected = selectedId === term.id;
  const hasSelectionForCourse = Boolean(selectedId);
  const isDimmed = hasSelectionForCourse && !isSelected;

  const color = pickCourseColor(term.courseCode);
  const kind = getTermKind(term);
  const classes = [
    'planner-chip',
    kind ? `planner-chip--${kind}` : '',
    isSelected ? 'planner-chip--selected' : '',
    isDimmed ? 'planner-chip--dimmed' : '',
  ].filter(Boolean).join(' ');

  const time = term.time ? term.time : '';
  const type = term.typeLabel ? ` · ${term.typeLabel}` : '';
  const title = `${term.courseCode}${time ? ` ${time}` : ''}${term.location ? ` · ${term.location}` : ''}${type}`;
  return `
    <button class="${classes}" style="--chip-color:${color}" data-term-id="${escapeHtml(term.id)}" data-course-code="${escapeHtml(term.courseCode)}" data-term-group="${escapeHtml(groupKey)}" title="${escapeHtml(title)}" type="button">
      <span class="planner-chip__left">
        <span class="planner-chip__code">${escapeHtml(term.courseCode)}</span>
        ${term.typeLabel ? `<span class="planner-chip__type">${escapeHtml(term.typeLabel)}</span>` : ''}
        ${term.location ? `<span class="text-muted">${escapeHtml(term.location)}</span>` : ''}
      </span>
      <span class="planner-chip__right">
        ${time ? `<span class="planner-chip__time">${escapeHtml(time)}</span>` : ''}
      </span>
    </button>
  `;
}

function getTermKind(term) {
  const t = (term?.typeLabel || '').toLowerCase();
  if (t.includes('zkouška')) return 'exam';
  if (t.includes('zápočet')) return 'credit';
  return '';
}

function getTermGroupKey(term) {
  const courseCode = term?.courseCode || '';
  const typeGroup = normalizeTypeGroup(term?.typeLabel || '');
  return `${courseCode}|${typeGroup || 'term'}`;
}

function normalizeTypeGroup(typeLabel) {
  const t = String(typeLabel || '').toLowerCase();
  const kind = t.includes('zkouška') ? 'zkouška' : (t.includes('zápočet') ? 'zápočet' : '');
  const formMatch = t.match(/\(([^)]+)\)/);
  const form = formMatch ? formMatch[1].trim() : '';
  return [kind, form].filter(Boolean).join(':');
}

function isExamLikeTerm(term) {
  // For planning we treat both exams and credit terms as “exam period obligations”
  const t = (term?.typeLabel || '').toLowerCase();
  return Boolean(term?.date) && (t.includes('zkouška') || t.includes('zápočet'));
}

function groupTermsByCourse(terms) {
  const out = {};
  for (const t of (terms || [])) {
    if (!t?.courseCode) continue;
    (out[t.courseCode] || (out[t.courseCode] = [])).push(t);
  }
  return out;
}

function dedupeExamLike(list) {
  const seen = new Set();
  const out = [];
  for (const t of list) {
    const key = `${t.courseCode}|${t.date}|${t.time || ''}|${t.location || ''}|${t.typeLabel || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function synthesizeCoursesFromTerms(terms) {
  const byCode = {};
  for (const t of (terms || [])) {
    if (!t?.courseCode) continue;
    const code = t.courseCode;
    if (!byCode[code]) {
      byCode[code] = {
        id: `synthetic_${code}`,
        code,
        name: t.courseName || code,
        credits: null,
        components: [],
        events: [],
      };
    } else if (!byCode[code].name && t.courseName) {
      byCode[code].name = t.courseName;
    }
  }
  return Object.values(byCode).sort((a, b) => a.code.localeCompare(b.code));
}

function pickCourseColor(courseCode) {
  const palette = [
    'var(--color-teal)',
    'var(--color-blue)',
    'var(--color-amber)',
    'var(--color-purple)',
    'var(--color-red)',
  ];
  let hash = 0;
  for (let i = 0; i < (courseCode || '').length; i++) hash = (hash * 31 + courseCode.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

const AI_PARSER_SYSTEM_PROMPT = `Z textu z InSIS vytěž seznam termínů (zkoušky/zápočty). Vrať POUZE platný JSON (bez markdown) ve formátu:
{
  "terms": [
    {
      "courseCode": "4IT218",
      "courseName": "Databáze",
      "dateTimeCZ": "21.05.2026 10:00",
      "location": "SB 107 (ZI)",
      "typeLabel": "zkouška (e-test)"
    }
  ]
}

Pravidla:
- courseCode je povinný
- dateTimeCZ je povinné a musí být ve tvaru DD.MM.YYYY HH:MM
- courseName, location, typeLabel jsou volitelné`;

function buildAIParserUserPrompt(rawText) {
  return `Text z InSIS:\n\n${rawText}`;
}

function normalizeParsedTerms(data) {
  const list = Array.isArray(data?.terms) ? data.terms : [];
  const terms = [];
  for (const item of list) {
    const courseCode = (item.courseCode || '').trim();
    const dateTimeCZ = (item.dateTimeCZ || '').trim();
    if (!courseCode || !dateTimeCZ) continue;
    const parsed = parseDateTimeCZ(dateTimeCZ);
    if (!parsed) continue;
    const id = stableTermId(courseCode, parsed.dateISO, parsed.time, item.location || '');
    terms.push({
      id,
      courseCode,
      courseName: (item.courseName || '').trim(),
      date: parsed.dateISO,
      time: parsed.time,
      location: (item.location || '').trim(),
      typeLabel: (item.typeLabel || '').trim(),
      source: 'ai',
    });
  }
  terms.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  return dedupeTerms(terms);
}

function parseDateTimeCZ(dateTimeCZ) {
  const m = dateTimeCZ.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const dd = m[1].padStart(2, '0');
  const mm = m[2].padStart(2, '0');
  const yyyy = m[3];
  const hh = m[4].padStart(2, '0');
  const min = m[5];
  return { dateISO: `${yyyy}-${mm}-${dd}`, time: `${hh}:${min}` };
}

function stableTermId(courseCode, dateISO, time, location) {
  const base = `${courseCode}|${dateISO}|${time || ''}|${location || ''}`;
  let h = 2166136261;
  for (let i = 0; i < base.length; i++) {
    h ^= base.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `t_${(h >>> 0).toString(36)}`;
}

function dedupeTerms(terms) {
  const seen = new Set();
  const out = [];
  for (const t of terms) {
    const key = `${t.courseCode}|${t.date}|${t.time || ''}|${t.location || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function renderPlanResult(data) {
  const plan = data.plan || [];
  const warnings = data.warnings || [];
  const advice = data.generalAdvice || '';

  const warningHtml = warnings.length > 0
    ? warnings.map(w => `<div class="alert alert--warning mb-2">${w}</div>`).join('')
    : '';

  const adviceHtml = advice
    ? `<div class="card planner__advice mb-5"><p>${advice}</p></div>`
    : '';

  const planCards = plan.map(item => {
    const priorityColors = { high: '#dc2626', medium: '#d97706', low: '#00957d' };
    const priorityBg = { high: 'rgba(220,38,38,0.1)', medium: 'rgba(217,119,6,0.1)', low: 'rgba(0,149,125,0.1)' };
    const priorityLabels = { high: 'Vysoká', medium: 'Střední', low: 'Nízká' };
    const p = item.priority || 'medium';
    const color = priorityColors[p] || priorityColors.medium;
    const bg = priorityBg[p] || priorityBg.medium;
    const pLabel = priorityLabels[p] || p;
    const dateFmt = item.suggestedDate ? formatDateCZ(item.suggestedDate) : '—';

    return `
      <div class="planner__plan-card">
        <div class="planner__plan-bar" style="background-color:${color}"></div>
        <div class="planner__plan-body">
          <div class="planner__plan-header">
            <div>
              <span class="mono text-teal">${item.courseCode || ''}</span>
              <strong>${item.courseName || ''}</strong>
            </div>
            <span class="badge" style="background-color:${bg};color:${color}">${pLabel} priorita</span>
          </div>
          <p class="text-sm"><strong>Doporučený termín:</strong> ${dateFmt}</p>
          ${item.reason ? `<p class="text-sm text-muted">${item.reason}</p>` : ''}
          ${item.preparationTip ? `<p class="text-sm" style="margin-top:var(--space-2)"><strong>Tip:</strong> ${item.preparationTip}</p>` : ''}
        </div>
      </div>
    `;
  }).join('');

  return `
    <h3 class="section-title mb-4">Navržený <span class="accent">plán</span></h3>
    ${warningHtml}
    ${adviceHtml}
    <div class="planner__plan-list">${planCards}</div>
  `;
}
