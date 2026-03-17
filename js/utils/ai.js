/* ==========================================================================
   StudyHub — Abstract AI layer (Gemini API)
   ========================================================================== */

import { getSettings, updateSettings } from '../store.js';

const AI_CONFIG = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
  maxOutputTokens: 8000,
};

// ── API key management ───────────────────────────────────────────────────────

/**
 * @returns {string}
 */
export function getApiKey() {
  return getSettings().apiKey || '';
}

/**
 * @param {string} key
 */
export function setApiKey(key) {
  updateSettings({ apiKey: key });
}

/**
 * @returns {boolean}
 */
export function hasApiKey() {
  return getApiKey().length > 0;
}

// ── Core AI call ─────────────────────────────────────────────────────────────

/**
 * Send a prompt to the AI model and return the text response.
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @returns {Promise<string>}
 */
export async function callAI(systemPrompt, userPrompt) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('API_KEY_MISSING');
  }

  const url = `${AI_CONFIG.endpoint}/${AI_CONFIG.model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{
      parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: AI_CONFIG.maxOutputTokens,
    },
  };

  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`Chyba připojení k AI: ${err.message}`);
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    if (resp.status === 400 && text.includes('API_KEY_INVALID')) {
      throw new Error('API klíč je neplatný. Zkontroluj ho v nastavení.');
    }
    if (resp.status === 429) {
      throw new Error('Příliš mnoho požadavků. Zkus to za chvíli.');
    }
    throw new Error(`AI chyba (${resp.status}): ${text.slice(0, 200)}`);
  }

  let data;
  try {
    data = await resp.json();
  } catch {
    throw new Error('AI vrátila neplatnou odpověď.');
  }

  const result = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!result) {
    throw new Error('AI nevrátila žádný text.');
  }

  return result;
}

// ── Response parsing ─────────────────────────────────────────────────────────

/**
 * Clean markdown code fences and parse JSON from AI response.
 * @param {string} text
 * @returns {object}
 */
export function parseAIResponse(text) {
  console.warn('parseAIResponse: raw AI response', text);

  let cleaned = text.trim();

  // Remove ```json ... ``` wrappers
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // fall through
  }

  // a) Try trimming to the last likely JSON ending: "}]” or "}"
  try {
    const lastArrayEnd = cleaned.lastIndexOf('}]');
    const lastObjectEnd = cleaned.lastIndexOf('}');
    const cutAt = Math.max(
      lastArrayEnd >= 0 ? lastArrayEnd + 2 : -1,
      lastObjectEnd >= 0 ? lastObjectEnd + 1 : -1,
    );
    if (cutAt > 0) {
      return JSON.parse(cleaned.slice(0, cutAt));
    }
  } catch {
    // fall through
  }

  // b) Try extracting the first "{" ... last "}" span
  try {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    }
  } catch {
    // fall through
  }

  // c) User-friendly message only
  alert('AI odpověď se nepodařilo zpracovat. Zkus vložit kratší text nebo rozdělit rozvrh zvlášť.');
  throw new Error('AI_RESPONSE_PARSE_FAILED');
}

// ── API key dialog ───────────────────────────────────────────────────────────

/**
 * Show a modal dialog asking for the Gemini API key.
 * Resolves with true if key was saved, false if cancelled.
 * @returns {Promise<boolean>}
 */
export function showApiKeyDialog() {
  return new Promise((resolve) => {
    // Remove existing dialog if any
    document.querySelector('.ai-key-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'ai-key-overlay';
    overlay.innerHTML = `
      <div class="ai-key-dialog">
        <h3 class="section-title mb-4"><span class="accent">Gemini</span> API klíč</h3>
        <p class="text-sm mb-4">
          Pro AI funkce potřebuješ Gemini API klíč (zdarma).<br>
          Vygeneruj si ho na
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" class="text-teal" style="text-decoration:underline">aistudio.google.com/apikey</a>
        </p>
        <input class="input mb-4" id="ai-key-input" type="text"
          placeholder="Vlož API klíč…" value="${getApiKey()}">
        <div class="ai-key-dialog__actions">
          <button class="btn btn--primary" id="ai-key-save">Uložit</button>
          <button class="btn btn--outline" id="ai-key-cancel">Zrušit</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const input = overlay.querySelector('#ai-key-input');
    input.focus();

    const close = (saved) => {
      overlay.remove();
      resolve(saved);
    };

    overlay.querySelector('#ai-key-save').addEventListener('click', () => {
      const key = input.value.trim();
      if (key) {
        setApiKey(key);
        close(true);
      }
    });

    overlay.querySelector('#ai-key-cancel').addEventListener('click', () => close(false));

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const key = input.value.trim();
        if (key) { setApiKey(key); close(true); }
      }
      if (e.key === 'Escape') close(false);
    });
  });
}

/**
 * Ensure API key is available, prompting if needed.
 * @returns {Promise<boolean>} true if key is available
 */
export async function ensureApiKey() {
  if (hasApiKey()) return true;
  return showApiKeyDialog();
}
