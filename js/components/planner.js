/* ==========================================================================
   StudyHub — AI exam planner
   ========================================================================== */

import { getCourses, getSemester } from '../store.js';
import { callAI, parseAIResponse, ensureApiKey } from '../utils/ai.js';
import { formatDateCZ, daysUntil } from '../utils/dates.js';

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

  // Collect exam events
  const examEvents = [];
  for (const c of courses) {
    if (!c.events) continue;
    for (const e of c.events) {
      if (e.type === 'exam') {
        examEvents.push({ ...e, courseCode: c.code, courseName: c.name, credits: c.credits });
      }
    }
  }

  container.innerHTML = `
    <div class="planner">
      <h2 class="section-title mb-6">Plánovač <span class="accent">zkouškového</span></h2>

      <!-- Exam overview -->
      <section class="form-section">
        <h3 class="form-section__title">Tvoje zkouškové termíny</h3>
        ${examEvents.length > 0 ? `
          <div class="planner__exams">
            ${examEvents.map(e => {
              const rel = daysUntil(e.date);
              return `
                <div class="planner__exam-card">
                  <div class="planner__exam-date">
                    <span class="mono text-teal">${e.courseCode}</span>
                    <span class="text-sm">${formatDateCZ(e.date)}</span>
                    <span class="badge badge--exam">${rel}</span>
                  </div>
                  <span class="text-sm">${e.title}</span>
                  <span class="text-sm text-muted">${e.courseName} (${e.credits} kr.)</span>
                </div>
              `;
            }).join('')}
          </div>
        ` : '<p class="text-muted text-sm">Nemáš žádné zkouškové termíny. Přidej je u svých předmětů.</p>'}
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
    const courseSummary = courses.map(c => {
      const exams = (c.events || []).filter(e => e.type === 'exam');
      const comps = (c.components || []).map(comp => `${comp.name} (${comp.weight}%)`).join(', ');
      return `- ${c.code} ${c.name} (${c.credits} kr.): hodnocení: ${comps}. Zkouškové termíny: ${exams.map(e => `${e.title} ${e.date}`).join(', ') || 'žádné'}`;
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
    const priorityColors = { high: 'var(--color-red)', medium: 'var(--color-amber)', low: 'var(--color-teal)' };
    const priorityLabels = { high: 'Vysoká', medium: 'Střední', low: 'Nízká' };
    const color = priorityColors[item.priority] || priorityColors.medium;
    const pLabel = priorityLabels[item.priority] || item.priority;
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
            <span class="badge" style="background-color:color-mix(in srgb, ${color} 15%, transparent);color:${color}">${pLabel} priorita</span>
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
