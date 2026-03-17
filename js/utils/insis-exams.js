/* ==========================================================================
   StudyHub — InSIS exam terms paste parser (heuristic, offline-first)
   ========================================================================== */

/**
 * Parse a typical InSIS copied table/text and extract exam/credit terms.
 * The input is usually a multi-line block where each row starts with an index ("1.", "2.", ...).
 *
 * @param {string} text
 * @returns {{ terms: Array, errors: Array<string> }}
 */
export function parseInsisExamPaste(text) {
  const raw = String(text || '').replaceAll('\r\n', '\n').trim();
  if (!raw) return { terms: [], errors: [] };

  const blocks = splitIntoRowBlocks(raw);
  const terms = [];
  const errors = [];

  for (const block of blocks) {
    const parsed = parseRowBlock(block);
    if (!parsed) {
      errors.push(block.slice(0, 140));
      continue;
    }
    terms.push(parsed);
  }

  terms.sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`));
  return { terms: dedupeTerms(terms), errors };
}

function splitIntoRowBlocks(raw) {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const blocks = [];
  let current = [];

  for (const line of lines) {
    // Typical row starts: "1." or "1.\t" etc.
    if (/^\d+\.\s*/.test(line) && current.length) {
      blocks.push(current.join('\n'));
      current = [];
    }
    current.push(line);
  }
  if (current.length) blocks.push(current.join('\n'));

  // If we didn't detect rows, treat the whole text as one block to attempt extraction.
  if (blocks.length === 1 && blocks[0] === raw && !/^\d+\.\s*/m.test(raw)) {
    return [raw];
  }
  return blocks;
}

function parseRowBlock(block) {
  const normalized = block.replace(/\s+/g, ' ').trim();

  const courseCode = (normalized.match(/\b\d[A-Z]{2}\d{3}\b/) || [])[0] || '';
  if (!courseCode) return null;

  const dt = normalized.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!dt) return null;

  const dd = dt[1].padStart(2, '0');
  const mm = dt[2].padStart(2, '0');
  const yyyy = dt[3];
  const hh = dt[4].padStart(2, '0');
  const min = dt[5];

  const dateISO = `${yyyy}-${mm}-${dd}`;
  const time = `${hh}:${min}`;

  // Try to capture course name between code and datetime
  const idxCode = normalized.indexOf(courseCode);
  const idxDt = normalized.indexOf(dt[0]);
  let courseName = '';
  if (idxCode >= 0 && idxDt > idxCode) {
    courseName = normalized.slice(idxCode + courseCode.length, idxDt).trim();
    courseName = courseName.replace(/^[–-]\s*/, '').trim();
  }

  // Location: e.g. "SB 107 (ZI)" or "JM 372" (keep the most specific match)
  const locationMatch = normalized.match(/\b[A-Z]{1,4}\s?\d{2,4}\s*(?:\([A-Z]{1,4}\))?/);
  const location = locationMatch ? locationMatch[0].trim() : '';

  // Type label: try to get something like "zkouška (e-test)" or "zápočet (písemná)"
  const typeLabel = extractTypeLabel(normalized);

  const id = stableTermId(courseCode, dateISO, time, location);

  return {
    id,
    courseCode,
    courseName,
    date: dateISO,
    time,
    location,
    typeLabel,
    source: 'paste',
  };
}

function extractTypeLabel(normalized) {
  const m = normalized.match(/\b(zkouška|zápočet)\b\s*(\([^)]*\))?/i);
  if (!m) return '';
  const base = m[1].toLowerCase();
  const extra = m[2] ? ` ${m[2]}` : '';
  return `${base}${extra}`.trim();
}

export function stableTermId(courseCode, dateISO, time, location) {
  const base = `${courseCode}|${dateISO}|${time || ''}|${location || ''}`;
  let h = 2166136261;
  for (let i = 0; i < base.length; i++) {
    h ^= base.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `t_${(h >>> 0).toString(36)}`;
}

export function dedupeTerms(terms) {
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

