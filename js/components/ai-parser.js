/* ==========================================================================
   StudyHub — AI syllabus parser (integrates into course form)
   ========================================================================== */

import { callAI, parseAIResponse, ensureApiKey } from '../utils/ai.js';

const SYSTEM_PROMPT = `Jsi asistent pro studenty VŠE v Praze. Z textu sylabu nebo prezentace vyučujícího extrahuj strukturovaná data o předmětu.

Vrať POUZE platný JSON (bez komentářů, bez markdown) v tomto formátu:
{
  "code": "4IT115",
  "name": "Softwarové inženýrství",
  "credits": 6,
  "group": "povinny",
  "lecturer": "Doc. Ing. Novák",
  "components": [
    {
      "name": "Průběžný test",
      "type": "test",
      "weight": 30,
      "maxScore": 30,
      "passingScore": 15,
      "description": "Test v 7. týdnu výuky"
    }
  ],
  "events": [
    {
      "title": "Průběžný test",
      "type": "test",
      "date": "2026-04-06",
      "time": "10:00",
      "location": "SB 110",
      "notes": ""
    }
  ],
  "requirements": [
    "Získat min. 50 % z průběžného testu"
  ],
  "gradingScale": [
    { "grade": "A", "minPercent": 90 },
    { "grade": "B", "minPercent": 75 },
    { "grade": "C", "minPercent": 65 },
    { "grade": "D", "minPercent": 55 },
    { "grade": "E", "minPercent": 50 },
    { "grade": "F", "minPercent": 0 }
  ],
  "notes": ""
}

Pravidla:
- Typy components: "exam", "test", "project", "homework", "seminar", "attendance", "other"
- Typy events: "test", "exam", "deadline", "presentation", "other"
- Datumy ve formátu ISO YYYY-MM-DD. Aktuální akademický rok je 2025/26, letní semestr.
- Pokud informace chybí, vynech pole nebo dej prázdný string/null.
- Váhy (weight) jsou v procentech, součet by měl být 100.
- Pokud není klasifikační stupnice uvedena, použij standardní VŠE: A≥90, B≥75, C≥65, D≥55, E≥50, F<50.
- group: "povinny" | "volitelny" | "jazyk" | "telocvik"`;

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
        Vlož text sylabu z InSIS nebo prezentace vyučujícího. AI extrahuje data a předvyplní formulář.
      </p>
      <textarea class="textarea" id="ai-input" rows="6"
        placeholder="Zkopíruj a vlož text sylabu, prezentace nebo podmínek předmětu…"></textarea>
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

    // Ensure API key
    const hasKey = await ensureApiKey();
    if (!hasKey) return;

    // Loading state
    btn.disabled = true;
    textEl.textContent = 'Analyzuji…';
    spinnerEl.style.display = '';
    resultEl.innerHTML = '';

    try {
      const response = await callAI(SYSTEM_PROMPT, text);
      const data = parseAIResponse(response);

      resultEl.innerHTML = `
        <div class="alert alert--ok">
          AI úspěšně extrahovala data. Zkontroluj a uprav formulář níže.
        </div>
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
