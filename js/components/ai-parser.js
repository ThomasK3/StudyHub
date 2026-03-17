/* ==========================================================================
   StudyHub — AI syllabus parser (integrates into course form)
   ========================================================================== */

import { callAI, parseAIResponse, ensureApiKey } from '../utils/ai.js';

const SYSTEM_PROMPT = `Jsi asistent pro parsování sylabů předmětů z VŠE Praha (InSIS).
Student ti pošle zkopírovaný text sylabu. Extrahuj z něj strukturovaná data.

InSIS sylabus má typicky tyto sekce:
- Kód předmětu, Název, ECTS kredity, Forma ukončení, Semestr
- Vyučující (všichni, s jejich rolemi)
- Zaměření předmětu (volný text)
- Výsledky učení (odrážkový seznam)
- Obsah předmětu (číslovaný seznam 1-13 témat po týdnech)
- Studijní zátěž (tabulka: přednášky, cvičení, projekt, příprava... v hodinách)
- Způsoby hodnocení (tabulka: název složky + procento)
- Klasifikační stupnice (1-4 nebo A-F s procenty)
- Zvláštní podmínky (text — podmínky splnění)
- Literatura (povinná + doporučená)
- Rozvrhové akce (tabulka: den, čas, místnost, typ, vyučující, kapacita)

Odpověz POUZE validním JSON bez markdown backtick:
{
  "code": "3MG216",
  "name": "...",
  "credits": 6,
  "semester": "LS 2025/26",
  "group": "povinny",
  "lecturer": "hlavní přednášející",
  "allLecturers": ["jméno (role)", "..."],
  "description": "zaměření předmětu",
  "learningOutcomes": ["...", "..."],
  "weeklyTopics": [{"week": 1, "topic": "..."}, {"week": 2, "topic": "..."}, "...až 13"],
  "workload": {"lectures": 26, "seminars": 26, "project": 52, "testPrep": 16, "examPrep": 36},
  "components": [
    {"name": "...", "weight": 40, "type": "project", "maxScore": null, "passingScore": null, "description": ""}
  ],
  "events": [
    {"title": "...", "type": "exam", "date": "2026-05-25", "time": "09:00", "location": "SB 110", "notes": ""}
  ],
  "gradingScale": [
    {"grade": "1", "label": "Výborně", "minPercent": 90},
    {"grade": "2", "label": "Velmi dobře", "minPercent": 75},
    {"grade": "3", "label": "Dobře", "minPercent": 60},
    {"grade": "4", "label": "Nevyhověl", "minPercent": 0}
  ],
  "requirements": ["max 3 absence", "..."],
  "literature": {"required": ["..."], "recommended": ["..."]},
  "schedule": [{"day": "Po", "time": "09:15-10:45", "room": "RB 205", "type": "seminar", "teacher": "...", "frequency": "každý", "capacity": 25}],
  "notes": ""
}

Pravidla:
- Typy components: "exam", "test", "project", "homework", "seminar", "attendance", "other"
- Typy events: "test", "exam", "deadline", "presentation", "other"
- Typy schedule: "lecture", "seminar", "lab", "other"
- Dny zkráceně: "Po", "Út", "St", "Čt", "Pá"
- Datumy ve formátu ISO YYYY-MM-DD. Aktuální akademický rok je 2025/26, letní semestr.
- Pokud informace chybí, vynech pole nebo dej prázdný string/null/prázdné pole.
- Váhy (weight) jsou v procentech, součet by měl být 100.
- Pokud není klasifikační stupnice uvedena, použij standardní VŠE: 1≥90, 2≥75, 3≥60, 4<60.
- group: "povinny" | "volitelny" | "jazyk" | "telocvik"
- Z "Zaměření předmětu" extrahuj text do "description"
- Z "Výsledky učení" extrahuj odrážky do "learningOutcomes"
- Z "Obsah předmětu" extrahuj témata do "weeklyTopics" (1-13)
- Z "Studijní zátěž" rozděl hodiny do kategorií v "workload"
- Z "Literatura" rozděl na required/recommended`;

const SUMMARY_PROMPT = `Na základě zaměření a obsahu předmětu napiš 2-3 věty studentsky přívětivého popisu. Piš česky, neformálně ale věcně. Shrň o čem předmět je a co se student naučí. Vrať POUZE text popisu, žádný JSON, žádné markdown.`;

/**
 * Render the AI parser section for the course form.
 * @returns {string} HTML string
 */
export function renderAIParserSection() {
  return `
    <section class="form-section ai-parser">
      <div class="form-section__header">
        <h3 class="form-section__title">AI import sylabu</h3>
        <span class="tag">volitelné</span>
      </div>
      <p class="text-sm text-muted mb-3">
        Vlož text sylabu z InSIS nebo prezentace vyučujícího. AI extrahuje data a předvyplní celý formulář — včetně obsahu po týdnech, rozvrhu a literatury.
      </p>
      <textarea class="textarea" id="ai-input" rows="6"
        placeholder="Zkopíruj a vlož celý text sylabu z InSIS…"></textarea>
      <div class="ai-parser__actions mt-3">
        <button class="btn btn--primary" id="btn-ai-parse">
          <span id="ai-parse-text">Analyzovat pomocí AI</span>
          <span id="ai-parse-spinner" class="spinner" style="display:none"></span>
        </button>
      </div>
      <div id="ai-parse-result" class="mt-3"></div>
    </section>
  `;
}

/**
 * Render the AI summary generator button (for use inside the form content section).
 * @returns {string} HTML string
 */
export function renderAISummaryButton() {
  return `
    <div class="ai-summary-action">
      <button class="btn btn--outline btn--sm" id="btn-ai-summary" type="button">
        Vygenerovat popis pomocí AI
      </button>
      <span id="ai-summary-spinner" class="spinner" style="display:none"></span>
      <span id="ai-summary-status" class="text-sm text-muted"></span>
    </div>
  `;
}

/**
 * Bind AI parser events. Call after the form is rendered.
 * @param {HTMLElement} wrapper - The form wrapper element
 * @param {function} onParsed - Callback with parsed data to fill the form
 */
export function bindAIParser(wrapper, onParsed) {
  const btn = wrapper.querySelector('#btn-ai-parse');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const input = wrapper.querySelector('#ai-input');
    const resultEl = wrapper.querySelector('#ai-parse-result');
    const textEl = wrapper.querySelector('#ai-parse-text');
    const spinnerEl = wrapper.querySelector('#ai-parse-spinner');

    const text = input?.value?.trim();
    if (!text) {
      resultEl.innerHTML = '<div class="alert alert--warning">Vlož text sylabu pro analýzu.</div>';
      return;
    }

    const hasKey = await ensureApiKey();
    if (!hasKey) return;

    btn.disabled = true;
    textEl.textContent = 'Analyzuji…';
    spinnerEl.style.display = '';
    resultEl.innerHTML = '';

    try {
      const response = await callAI(SYSTEM_PROMPT, text);
      const data = parseAIResponse(response);

      // Build preview of what was extracted
      const preview = buildPreview(data);
      resultEl.innerHTML = `
        <div class="alert alert--ok mb-3">
          AI úspěšně extrahovala data. Zkontroluj a uprav formulář níže.
        </div>
        <div class="ai-parser__preview">${preview}</div>
      `;

      if (onParsed) onParsed(data);
    } catch (err) {
      resultEl.innerHTML = `<div class="alert alert--error">${err.message}</div>`;
    } finally {
      btn.disabled = false;
      textEl.textContent = 'Analyzovat pomocí AI';
      spinnerEl.style.display = 'none';
    }
  });
}

/**
 * Bind the AI summary generator button.
 * @param {HTMLElement} wrapper
 * @param {function} getContext - Returns { description, weeklyTopics } from current form state
 * @param {function} onGenerated - Callback with generated summary text
 */
export function bindAISummary(wrapper, getContext, onGenerated) {
  const btn = wrapper.querySelector('#btn-ai-summary');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const spinner = wrapper.querySelector('#ai-summary-spinner');
    const status = wrapper.querySelector('#ai-summary-status');

    const hasKey = await ensureApiKey();
    if (!hasKey) return;

    const ctx = getContext();
    if (!ctx.description && (!ctx.weeklyTopics || ctx.weeklyTopics.length === 0)) {
      status.textContent = 'Nejdřív vyplň zaměření nebo obsah po týdnech.';
      return;
    }

    btn.disabled = true;
    spinner.style.display = '';
    status.textContent = '';

    const topicsText = (ctx.weeklyTopics || [])
      .map(t => `${t.week}. ${t.topic}`)
      .filter(t => t.length > 3)
      .join('\n');

    const userPrompt = `Předmět: ${ctx.name || ''}
Zaměření: ${ctx.description || 'neuvedeno'}
Obsah po týdnech:
${topicsText || 'neuvedeno'}`;

    try {
      const summary = await callAI(SUMMARY_PROMPT, userPrompt);
      // Clean up — remove any quotes wrapping
      const cleaned = summary.replace(/^["']|["']$/g, '').trim();
      if (onGenerated) onGenerated(cleaned);
      status.textContent = 'Popis vygenerován.';
    } catch (err) {
      status.textContent = `Chyba: ${err.message}`;
    } finally {
      btn.disabled = false;
      spinner.style.display = 'none';
    }
  });
}

/**
 * Build a short preview of extracted data.
 * @param {object} data
 * @returns {string} HTML
 */
function buildPreview(data) {
  const items = [];
  if (data.code) items.push(`<span class="mono text-teal">${data.code}</span> ${data.name || ''}`);
  if (data.credits) items.push(`${data.credits} kr.`);
  if (data.components?.length) items.push(`${data.components.length} složek hodnocení`);
  if (data.weeklyTopics?.length) items.push(`${data.weeklyTopics.length} témat po týdnech`);
  if (data.schedule?.length) items.push(`${data.schedule.length} rozvrhových akcí`);
  if (data.learningOutcomes?.length) items.push(`${data.learningOutcomes.length} výsledků učení`);
  if (data.literature?.required?.length || data.literature?.recommended?.length) {
    const total = (data.literature.required?.length || 0) + (data.literature.recommended?.length || 0);
    items.push(`${total} zdrojů literatury`);
  }
  if (data.workload) items.push('studijní zátěž');
  if (data.requirements?.length) items.push(`${data.requirements.length} podmínek`);

  return `<p class="text-sm text-muted">Nalezeno: ${items.join(' · ')}</p>`;
}
