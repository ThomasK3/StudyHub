/* ==========================================================================
   StudyHub — Exam planner (deterministic scheduler + AI advisor)
   ========================================================================== */

import { getCourses, getSemester, getPlanner, updatePlanner } from '../store.js';
import { callAI, parseAIResponse, ensureApiKey } from '../utils/ai.js';
import { parseInsisExamPaste, stableTermId, dedupeTerms } from '../utils/insis-exams.js';
import { DAY_NAMES, formatDateCZ, daysUntil, getWeeksInRange } from '../utils/dates.js';
import { scheduleExams } from '../utils/scheduler.js';

const AI_ADVISOR_PROMPT = `Jsi studijní poradce pro studenty VŠE v Praze. Student ti dá seznam předmětů se zkouškami. Tvým úkolem je:

1. Seřadit předměty podle priority (které by měl dělat dřív)
2. Dát konkrétní tipy na přípravu ke každému předmětu
3. Upozornit na rizika

DŮLEŽITÉ: Pracuj POUZE s předměty, které ti student poskytne. NEvymýšlej vlastní.
DŮLEŽITÉ: NENastavuj termíny — to dělá algoritmus. Ty jen doporučuješ pořadí priorit a tipy.

Vrať POUZE platný JSON (bez komentářů, bez markdown):
{
  "priorityOrder": ["<kód1>", "<kód2>", "..."],
  "courseAdvice": [
    {
      "courseCode": "<kód>",
      "priority": "high|medium|low",
      "preparationTip": "<konkrétní tip na přípravu>",
      "estimatedDays": <kolik dní přípravy doporučuješ>
    }
  ],
  "generalAdvice": "<celkový doporučený postup>",
  "warnings": ["<varování>"]
}`;

/**
 * Render the planner view.
 * @param {HTMLElement} container
 */
export function renderPlanner(container) {
  const courses = getCourses();
  const semester = getSemester();
  const planner = getPlanner();
  const rules = planner.rules || DEFAULT_RULES;

  const hasExamPeriod = semester?.examStart && semester?.examEnd;
  const allCourses = mergeCoursesWithTerms(courses, planner.terms || []);

  container.innerHTML = `
    <div class="planner">
      <h2 class="section-title mb-6">Plánovač <span class="accent">zkouškového</span></h2>

      <!-- Scheduler warnings -->
      <div id="planner-warnings"></div>

      <!-- Hero: Exam calendar (full width) -->
      <section class="planner__hero">
        ${!hasExamPeriod
          ? `<div class="alert alert--warning">Doplň zkouškové období v nastavení semestru (začátek a konec zkouškového).</div>`
          : `
            <div id="planner-calendar">
              ${renderExamCalendar(planner.terms || [], planner.selectedByCourse || {}, semester)}
            </div>
          `}
      </section>

      <!-- Course cards grid -->
      <section class="planner__courses-section">
        <h3 class="form-section__title">Tvoje předměty</h3>
        <div id="planner-course-cards">
          ${renderCourseCards(courses, planner.terms || [], planner.selectedByCourse || {})}
        </div>
      </section>

      <!-- Rules section -->
      <section class="planner__rules form-section">
        <h3 class="form-section__title">Pravidla rozvržení</h3>
        <div class="planner__rules-grid">
          <div class="planner__rule">
            <label class="text-sm" for="rule-max-week">Max zkoušek za týden</label>
            <input class="input input--sm" type="number" id="rule-max-week" min="1" max="5" value="${rules.maxPerWeek}">
          </div>
          <div class="planner__rule">
            <label class="text-sm" for="rule-min-days">Min. dní mezi zkouškami</label>
            <input class="input input--sm" type="number" id="rule-min-days" min="0" max="14" value="${rules.minDaysBetween}">
          </div>
          <div class="planner__rule">
            <label class="text-sm planner__rule-toggle" for="rule-prefer-early">
              <input type="checkbox" id="rule-prefer-early" ${rules.preferEarly ? 'checked' : ''}>
              Preferovat co nejdřívější termíny
            </label>
          </div>
        </div>

        <!-- Blocked ranges -->
        <div class="mt-3">
          <label class="text-sm text-muted">Blokované datumy (dovolená apod.)</label>
          <div id="blocked-ranges">
            ${renderBlockedRanges(rules.blockedRanges || [])}
          </div>
          <button class="btn btn--outline btn--sm mt-2" id="btn-add-blocked">+ Přidat blokované období</button>
        </div>

        <!-- Priority courses -->
        <div class="mt-3">
          <label class="text-sm text-muted">Předměty s prioritou (obtížnější → dřív)</label>
          <div id="priority-courses" class="planner__priority-chips">
            ${renderPriorityChips(allCourses, rules.priorityCourses || [])}
          </div>
        </div>

        <!-- Action buttons -->
        <div class="planner__schedule-actions mt-4">
          <button class="btn btn--primary" id="btn-auto-schedule">
            Automaticky rozvrhnout
          </button>
          <button class="btn btn--outline" id="btn-ai-advise" title="AI doporučí priority a tipy na přípravu">
            AI poradce
            <span id="ai-spinner" class="spinner" style="display:none"></span>
          </button>
        </div>
      </section>

      <!-- Two-column bottom: Import left, AI advice right -->
      <div class="planner__bottom">
        <!-- Left: Import -->
        <section class="planner__bottom-left form-section">
          <h3 class="form-section__title">Vložit termíny z InSIS</h3>
          <p class="text-sm text-muted mb-3">
            Zkopíruj tabulku termínů z InSIS a vlož ji sem.
          </p>
          <textarea class="textarea" id="planner-raw" rows="6"
            placeholder="Vlož sem zkopírovaný výpis z InSIS…">${escapeHtml(planner.rawText || '')}</textarea>
          <div class="planner__import-actions mt-3">
            <button class="btn btn--outline btn--sm" id="btn-parse">Načíst termíny</button>
            <button class="btn btn--outline btn--sm" id="btn-parse-ai" title="Vyžaduje API klíč">Načíst (AI)</button>
            <span class="text-sm text-muted" id="planner-parse-status"></span>
          </div>

          <!-- Legend of selected terms -->
          <div id="planner-legend" class="mt-4">
            ${renderSelectedLegend(planner.terms || [], planner.selectedByCourse || {}, courses)}
          </div>
        </section>

        <!-- Right: AI advice result -->
        <section class="planner__bottom-right form-section">
          <h3 class="form-section__title">AI doporučení</h3>
          <div id="planner-ai-result">
            <p class="text-sm text-muted">Klikni „AI poradce" pro doporučení priorit a tipů na přípravu.</p>
          </div>
        </section>
      </div>
    </div>
  `;

  bindRules(container, courses);
  bindAutoSchedule(container, courses, semester);
  bindAIAdvisor(container, courses, semester);
  bindImport(container, semester, courses);
  bindCalendarSelection(container, semester, courses);
}

// ── Default rules ───────────────────────────────────────────────────────────

const DEFAULT_RULES = {
  maxPerWeek: 1,
  minDaysBetween: 5,
  preferEarly: true,
  blockedRanges: [],
  priorityCourses: [],
};

// ── Rules UI ────────────────────────────────────────────────────────────────

function renderBlockedRanges(ranges) {
  if (!ranges.length) return '<p class="text-xs text-muted">Žádné blokované období.</p>';
  return ranges.map((r, i) => `
    <div class="planner__blocked-row" data-idx="${i}">
      <input class="input input--sm" type="date" value="${r.from}" data-field="from">
      <span class="text-sm">–</span>
      <input class="input input--sm" type="date" value="${r.to}" data-field="to">
      <input class="input input--sm" type="text" value="${escapeHtml(r.reason || '')}" placeholder="Důvod…" data-field="reason">
      <button class="btn btn--outline btn--sm btn--danger" data-remove-blocked="${i}" type="button">×</button>
    </div>
  `).join('');
}

function renderPriorityChips(allCourses, priorityCodes) {
  if (!allCourses.length) return '<p class="text-xs text-muted">Nejdříve vlož termíny nebo přidej předměty.</p>';
  const prioSet = new Set(priorityCodes);
  return allCourses.map(c => {
    const active = prioSet.has(c.code);
    return `<button type="button" class="planner__prio-chip ${active ? 'planner__prio-chip--active' : ''}" data-prio-code="${escapeHtml(c.code)}">${escapeHtml(c.code)}</button>`;
  }).join('');
}

function readRulesFromDOM(container) {
  const maxPerWeek = parseInt(container.querySelector('#rule-max-week')?.value, 10) || 1;
  const minDaysBetween = parseInt(container.querySelector('#rule-min-days')?.value, 10) || 5;
  const preferEarly = container.querySelector('#rule-prefer-early')?.checked !== false;

  // Read blocked ranges
  const blockedRanges = [];
  container.querySelectorAll('.planner__blocked-row').forEach(row => {
    const from = row.querySelector('[data-field="from"]')?.value || '';
    const to = row.querySelector('[data-field="to"]')?.value || '';
    const reason = row.querySelector('[data-field="reason"]')?.value || '';
    if (from && to) blockedRanges.push({ from, to, reason });
  });

  // Read priority courses
  const priorityCourses = [];
  container.querySelectorAll('.planner__prio-chip--active').forEach(chip => {
    const code = chip.dataset.prioCode;
    if (code) priorityCourses.push(code);
  });

  return { maxPerWeek, minDaysBetween, preferEarly, blockedRanges, priorityCourses };
}

function saveRules(container) {
  const rules = readRulesFromDOM(container);
  updatePlanner({ rules });
  return rules;
}

function bindRules(container, courses) {
  // Auto-save rules on change
  const rulesSection = container.querySelector('.planner__rules');
  if (!rulesSection) return;

  rulesSection.addEventListener('change', () => saveRules(container));
  rulesSection.addEventListener('input', (e) => {
    if (e.target.type === 'number') saveRules(container);
  });

  // Add blocked range
  container.querySelector('#btn-add-blocked')?.addEventListener('click', () => {
    const planner = getPlanner();
    const ranges = [...(planner.rules?.blockedRanges || []), { from: '', to: '', reason: '' }];
    updatePlanner({ rules: { ...(planner.rules || DEFAULT_RULES), blockedRanges: ranges } });
    container.querySelector('#blocked-ranges').innerHTML = renderBlockedRanges(ranges);
  });

  // Remove blocked range
  container.querySelector('#blocked-ranges')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-blocked]');
    if (!btn) return;
    const idx = parseInt(btn.dataset.removeBlocked, 10);
    const planner = getPlanner();
    const ranges = [...(planner.rules?.blockedRanges || [])];
    ranges.splice(idx, 1);
    updatePlanner({ rules: { ...(planner.rules || DEFAULT_RULES), blockedRanges: ranges } });
    container.querySelector('#blocked-ranges').innerHTML = renderBlockedRanges(ranges);
  });

  // Priority chips toggle
  container.querySelector('#priority-courses')?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-prio-code]');
    if (!chip) return;
    chip.classList.toggle('planner__prio-chip--active');
    saveRules(container);
  });
}

// ── Auto schedule ───────────────────────────────────────────────────────────

function buildSchedulerInput(courses, semester) {
  const planner = getPlanner();
  const terms = planner.terms || [];
  const rules = planner.rules || DEFAULT_RULES;
  const baseCourses = Array.isArray(courses) ? courses : [];

  // Build course list with available exam dates from both sources
  const termsByCourse = groupTermsByCourse(terms);
  const allCodes = new Set([
    ...baseCourses.map(c => c.code),
    ...Object.keys(termsByCourse),
  ]);

  const schedulerCourses = [];
  for (const code of allCodes) {
    const storeCourse = baseCourses.find(c => c.code === code);
    const name = storeCourse?.name || (termsByCourse[code]?.[0]?.courseName) || code;
    const credits = storeCourse?.credits ?? 0;

    // Exam dates from course events
    const examDatesFromStore = (storeCourse?.events || [])
      .filter(e => e.type === 'exam' && e.date)
      .map(e => ({ date: e.date, time: e.time || '', id: e.id || '' }));

    // Exam dates from planner terms
    const examDatesFromTerms = (termsByCourse[code] || [])
      .filter(t => t.date)
      .map(t => ({ date: t.date, time: t.time || '', id: t.id || '' }));

    // Dedupe by date+time
    const seen = new Set();
    const examDates = [];
    for (const ed of [...examDatesFromStore, ...examDatesFromTerms]) {
      const key = `${ed.date}|${ed.time}`;
      if (seen.has(key)) continue;
      seen.add(key);
      examDates.push(ed);
    }

    if (examDates.length > 0) {
      schedulerCourses.push({ code, name, credits, examDates });
    }
  }

  return { courses: schedulerCourses, rules };
}

function applyScheduleResult(result, container, semester, courses) {
  const planner = getPlanner();
  const terms = planner.terms || [];

  // Map schedule to selectedByCourse
  const selectedByCourse = {};
  for (const item of result.schedule) {
    // Find the matching term
    const matchingTerm = terms.find(t =>
      t.courseCode === item.code && t.date === item.selectedDate && (t.time || '') === (item.selectedTime || '')
    );
    if (matchingTerm) {
      const groupKey = getTermGroupKey(matchingTerm);
      selectedByCourse[groupKey] = matchingTerm.id;
    } else {
      // Match by examId
      const byId = terms.find(t => t.id === item.examId);
      if (byId) {
        const groupKey = getTermGroupKey(byId);
        selectedByCourse[groupKey] = byId.id;
      }
    }
  }

  updatePlanner({ selectedByCourse });

  // Show warnings
  const warningsEl = container.querySelector('#planner-warnings');
  if (warningsEl) {
    const warningHtml = result.warnings.map(w => {
      const isError = result.unscheduled.some(code => w.includes(code));
      return `<div class="alert ${isError ? 'alert--error' : 'alert--warning'} mb-2">${escapeHtml(w)}</div>`;
    }).join('');

    const successHtml = result.success
      ? `<div class="alert alert--success mb-2">Všechny zkoušky úspěšně rozvrženy (${result.schedule.length} předmětů).</div>`
      : '';

    warningsEl.innerHTML = successHtml + warningHtml;
  }

  refreshAll(container, semester, courses);
}

function bindAutoSchedule(container, courses, semester) {
  const btn = container.querySelector('#btn-auto-schedule');
  if (!btn) return;

  btn.addEventListener('click', () => {
    saveRules(container);
    const input = buildSchedulerInput(courses, semester);

    if (input.courses.length === 0) {
      const warningsEl = container.querySelector('#planner-warnings');
      if (warningsEl) {
        warningsEl.innerHTML = '<div class="alert alert--warning mb-2">Žádné předměty s termíny. Nejdříve vlož termíny z InSIS.</div>';
      }
      return;
    }

    const result = scheduleExams(input);
    applyScheduleResult(result, container, semester, courses);
  });
}

// ── AI advisor ──────────────────────────────────────────────────────────────

function bindAIAdvisor(container, courses, semester) {
  const btn = container.querySelector('#btn-ai-advise');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const hasKey = await ensureApiKey();
    if (!hasKey) return;

    const spinnerEl = container.querySelector('#ai-spinner');
    const resultEl = container.querySelector('#planner-ai-result');

    const planner = getPlanner();
    const terms = planner.terms || [];
    const baseCourses = Array.isArray(courses) ? courses : [];
    const allCourses = mergeCoursesWithTerms(baseCourses, terms);
    const termsByCourse = groupTermsByCourse(terms);

    const courseSummary = allCourses.map(c => {
      const storeCourse = baseCourses.find(sc => sc.code === c.code);
      const courseTerms = termsByCourse[c.code] || [];
      const events = (storeCourse?.events || []).filter(e => e.type === 'exam');
      const comps = (storeCourse?.components || []).map(comp => `${comp.name} (${comp.weight}%)`).join(', ');
      const creditsText = c.credits != null ? `${c.credits} kr.` : '— kr.';

      const allDates = [
        ...events.map(e => e.date),
        ...courseTerms.map(t => t.date),
      ].filter(Boolean);
      const uniqueDates = [...new Set(allDates)].sort();

      return `- ${c.code} ${c.name} (${creditsText})${comps ? `, hodnocení: ${comps}` : ''}. Termíny: ${uniqueDates.length ? uniqueDates.join(', ') : 'žádné'}`;
    }).join('\n');

    const semesterInfo = semester ? `Zkouškové období: ${semester.examStart} až ${semester.examEnd}` : '';
    const userPrompt = `Předměty studenta:\n${courseSummary}\n\n${semesterInfo}`;

    btn.disabled = true;
    spinnerEl.style.display = '';
    resultEl.innerHTML = '<p class="text-sm text-muted">AI analyzuje předměty…</p>';

    try {
      const response = await callAI(AI_ADVISOR_PROMPT, userPrompt);
      const data = parseAIResponse(response);

      // Apply AI priority order to rules
      if (Array.isArray(data.priorityOrder) && data.priorityOrder.length) {
        const planner = getPlanner();
        const currentRules = planner.rules || DEFAULT_RULES;
        updatePlanner({ rules: { ...currentRules, priorityCourses: data.priorityOrder } });
        // Update priority chips UI
        const prioEl = container.querySelector('#priority-courses');
        if (prioEl) {
          const allC = mergeCoursesWithTerms(courses, planner.terms || []);
          prioEl.innerHTML = renderPriorityChips(allC, data.priorityOrder);
        }
      }

      // Show advice
      resultEl.innerHTML = renderAIAdvice(data);

      // Auto-run scheduler with AI-recommended priorities
      saveRules(container);
      const input = buildSchedulerInput(courses, semester);
      if (input.courses.length > 0) {
        const result = scheduleExams(input);
        applyScheduleResult(result, container, semester, courses);
      }
    } catch (err) {
      resultEl.innerHTML = `<div class="alert alert--error">${escapeHtml(err.message)}</div>`;
    } finally {
      btn.disabled = false;
      spinnerEl.style.display = 'none';
    }
  });
}

function renderAIAdvice(data) {
  const advice = data.generalAdvice || '';
  const warnings = data.warnings || [];
  const courseAdvice = data.courseAdvice || [];

  const warningHtml = warnings.map(w => `<div class="alert alert--warning mb-2">${escapeHtml(w)}</div>`).join('');

  const adviceHtml = advice
    ? `<div class="card planner__advice mb-4"><p>${escapeHtml(advice)}</p></div>`
    : '';

  const cards = courseAdvice.map(item => {
    const priorityColors = { high: '#dc2626', medium: '#d97706', low: '#00957d' };
    const priorityBg = { high: 'rgba(220,38,38,0.1)', medium: 'rgba(217,119,6,0.1)', low: 'rgba(0,149,125,0.1)' };
    const priorityLabels = { high: 'Vysoká', medium: 'Střední', low: 'Nízká' };
    const p = item.priority || 'medium';
    const color = priorityColors[p] || priorityColors.medium;
    const bg = priorityBg[p] || priorityBg.medium;
    const pLabel = priorityLabels[p] || p;

    return `
      <div class="planner__plan-card">
        <div class="planner__plan-bar" style="background-color:${color}"></div>
        <div class="planner__plan-body">
          <div class="planner__plan-header">
            <span class="mono text-teal">${escapeHtml(item.courseCode || '')}</span>
            <span class="badge" style="background-color:${bg};color:${color}">${pLabel}</span>
          </div>
          ${item.estimatedDays ? `<p class="text-sm"><strong>Příprava:</strong> ~${item.estimatedDays} dní</p>` : ''}
          ${item.preparationTip ? `<p class="text-sm text-muted">${escapeHtml(item.preparationTip)}</p>` : ''}
        </div>
      </div>
    `;
  }).join('');

  return `${warningHtml}${adviceHtml}<div class="planner__plan-list">${cards}</div>`;
}

// ── Course cards ────────────────────────────────────────────────────────────

function renderCourseCards(courses, terms, selectedByCourse) {
  if (!courses?.length && !terms?.length) {
    return '<p class="text-sm text-muted">Zatím nemáš žádné předměty. Přidej je v sekci Předměty nebo vlož termíny z InSIS níže.</p>';
  }

  const allCourses = mergeCoursesWithTerms(courses, terms);

  const cards = allCourses.map(c => {
    const color = pickCourseColor(c.code);
    const termGroups = getTermGroupsForCourse(c.code, terms);
    const allSelected = termGroups.length > 0 && termGroups.every(g => selectedByCourse?.[g]);
    const noTerms = termGroups.length === 0;

    let statusIcon = '';
    let statusClass = '';
    if (noTerms) {
      statusIcon = `<span class="planner-course__status planner-course__status--none" title="Žádné termíny">—</span>`;
      statusClass = 'planner-course--no-terms';
    } else if (allSelected) {
      statusIcon = `<span class="planner-course__status planner-course__status--ok" title="Všechny termíny vybrány">✓</span>`;
      statusClass = 'planner-course--complete';
    } else {
      const missing = termGroups.length - termGroups.filter(g => selectedByCourse?.[g]).length;
      statusIcon = `<span class="planner-course__status planner-course__status--missing" title="Zbývá vybrat ${missing} termín(ů)">?</span>`;
      statusClass = 'planner-course--incomplete';
    }

    const credits = c.credits != null ? `<span class="badge badge--outline">${c.credits} kr.</span>` : '';

    return `
      <div class="planner-course ${statusClass}" style="--course-color:${color}">
        <div class="planner-course__color-bar"></div>
        <div class="planner-course__body">
          <div class="planner-course__top">
            <span class="mono text-sm" style="color:${color}">${escapeHtml(c.code)}</span>
            ${statusIcon}
          </div>
          <div class="planner-course__name">${escapeHtml(c.name)}</div>
          <div class="planner-course__meta">
            ${credits}
            ${termGroups.length ? `<span class="text-xs text-muted">${termGroups.filter(g => selectedByCourse?.[g]).length}/${termGroups.length} termínů</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `<div class="planner-courses-grid">${cards}</div>`;
}

function mergeCoursesWithTerms(courses, terms) {
  const byCode = {};
  for (const c of (courses || [])) {
    byCode[c.code] = { code: c.code, name: c.name, credits: c.credits };
  }
  for (const t of (terms || [])) {
    if (!t?.courseCode) continue;
    if (!byCode[t.courseCode]) {
      byCode[t.courseCode] = { code: t.courseCode, name: t.courseName || t.courseCode, credits: null };
    }
  }
  return Object.values(byCode).sort((a, b) => a.code.localeCompare(b.code));
}

function getTermGroupsForCourse(courseCode, terms) {
  const groups = new Set();
  for (const t of (terms || [])) {
    if (t.courseCode === courseCode) {
      groups.add(getTermGroupKey(t));
    }
  }
  return [...groups];
}

// ── Import binding ──────────────────────────────────────────────────────────

function bindImport(container, semester, courses) {
  const rawEl = container.querySelector('#planner-raw');
  const btnParse = container.querySelector('#btn-parse');
  const btnParseAI = container.querySelector('#btn-parse-ai');
  const statusEl = container.querySelector('#planner-parse-status');

  if (!rawEl || !btnParse || !btnParseAI || !statusEl) return;

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
    refreshAll(container, semester, courses);
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
      refreshAll(container, semester, courses);
    } catch {
      updateStatus('AI odpověď se nepodařilo zpracovat.');
    } finally {
      btnParseAI.disabled = false;
    }
  });
}

function bindCalendarSelection(container, semester, courses) {
  const cal = container.querySelector('#planner-calendar');
  if (!cal) return;

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
    refreshAll(container, semester, courses);
  });
}

function refreshAll(container, semester, courses) {
  const planner = getPlanner();
  if (semester?.examStart && semester?.examEnd) {
    const cal = container.querySelector('#planner-calendar');
    if (cal) cal.innerHTML = renderExamCalendar(planner.terms || [], planner.selectedByCourse || {}, semester);
  }
  const legend = container.querySelector('#planner-legend');
  if (legend) legend.innerHTML = renderSelectedLegend(planner.terms || [], planner.selectedByCourse || {}, courses);
  const cards = container.querySelector('#planner-course-cards');
  if (cards) cards.innerHTML = renderCourseCards(courses, planner.terms || [], planner.selectedByCourse || {});
  // Update priority chips to reflect new courses from terms
  const prioEl = container.querySelector('#priority-courses');
  if (prioEl) {
    const rules = planner.rules || DEFAULT_RULES;
    const allCourses = mergeCoursesWithTerms(courses, planner.terms || []);
    prioEl.innerHTML = renderPriorityChips(allCourses, rules.priorityCourses || []);
  }
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

// ── Legend ───────────────────────────────────────────────────────────────────

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
    return { key, code, term: t };
  }).filter(Boolean);

  if (!entries.length) {
    return '<p class="text-sm text-muted mb-0">Klikni na termín v kalendáři nebo použi automatické rozvržení.</p>';
  }

  const items = entries
    .sort((a, b) => a.term.date.localeCompare(b.term.date))
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

// ── Calendar ────────────────────────────────────────────────────────────────

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
  const title = `${term.courseCode}${time ? ` ${time}` : ''}${term.location ? ` · ${term.location}` : ''}${term.typeLabel ? ` · ${term.typeLabel}` : ''}`;
  return `
    <button class="${classes}" style="--chip-color:${color}" data-term-id="${escapeHtml(term.id)}" data-course-code="${escapeHtml(term.courseCode)}" data-term-group="${escapeHtml(groupKey)}" title="${escapeHtml(title)}" type="button">
      <span class="planner-chip__row">
        <span class="planner-chip__code">${escapeHtml(term.courseCode)}</span>
        <span class="planner-chip__right">
          ${time ? `<span class="planner-chip__time">${escapeHtml(time)}</span>` : ''}
        </span>
      </span>
      ${(term.typeLabel || term.location) ? `<span class="planner-chip__meta">${[term.typeLabel, term.location].filter(Boolean).map(s => escapeHtml(s)).join(' · ')}</span>` : ''}
    </button>
  `;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

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

function groupTermsByCourse(terms) {
  const out = {};
  for (const t of (terms || [])) {
    if (!t?.courseCode) continue;
    (out[t.courseCode] || (out[t.courseCode] = [])).push(t);
  }
  return out;
}

function pickCourseColor(courseCode) {
  const palette = [
    'var(--color-teal)', 'var(--color-blue)', 'var(--color-amber)',
    'var(--color-purple)', 'var(--color-red)',
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

// ── AI parser ───────────────────────────────────────────────────────────────

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
      id, courseCode,
      courseName: (item.courseName || '').trim(),
      date: parsed.dateISO, time: parsed.time,
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
