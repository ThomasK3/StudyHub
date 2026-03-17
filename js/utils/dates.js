/* ==========================================================================
   StudyHub — Date utilities
   ========================================================================== */

const CZ_MONTHS = [
  'ledna', 'února', 'března', 'dubna', 'května', 'června',
  'července', 'srpna', 'září', 'října', 'listopadu', 'prosince',
];

const CZ_MONTHS_SHORT = [
  'led', 'úno', 'bře', 'dub', 'kvě', 'čvn',
  'čvc', 'srp', 'zář', 'říj', 'lis', 'pro',
];

const CZ_MONTHS_NOM = [
  'Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen',
  'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec',
];

const DAY_NAMES = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];

export { CZ_MONTHS_NOM, DAY_NAMES };

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Create a midnight-local Date from an ISO date string. */
function toLocal(dateStr) {
  return new Date(dateStr + 'T00:00:00');
}

/** Format Date as ISO date string YYYY-MM-DD */
export function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── Teaching week ────────────────────────────────────────────────────────────

/**
 * Calculate the current teaching week number.
 * @param {string} semesterStart - ISO date of teaching start
 * @param {string} semesterEnd - ISO date of teaching end
 * @param {Date} [today]
 * @returns {{ label: string, number: number|null }}
 */
export function getTeachingWeek(semesterStart, semesterEnd, today = new Date()) {
  const start = toLocal(semesterStart);
  const end = toLocal(semesterEnd);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (t < start) return { label: 'Před semestrem', number: null };
  if (t > end)   return { label: 'Zkouškové období', number: null };

  const diffDays = Math.floor((t - start) / (1000 * 60 * 60 * 24));
  const week = Math.floor(diffDays / 7) + 1;
  return { label: `${week}. týden výuky`, number: week };
}

/**
 * Get the teaching week number (or special label) for any given date.
 * @param {object} semester - { teachingStart, teachingEnd, examStart, examEnd }
 * @param {Date} date
 * @returns {{ number: number|null, label: string }}
 */
export function getTeachingWeekForDate(semester, date) {
  if (!semester) return { number: null, label: '' };

  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const tStart = toLocal(semester.teachingStart);
  const tEnd = toLocal(semester.teachingEnd);
  const eEnd = toLocal(semester.examEnd);

  if (d < tStart) return { number: null, label: '' };
  if (d > eEnd)   return { number: null, label: '' };

  if (d > tEnd) return { number: null, label: 'Zk.' };

  const diffDays = Math.floor((d - tStart) / (1000 * 60 * 60 * 24));
  const week = Math.floor(diffDays / 7) + 1;
  return { number: week, label: `${week}.` };
}

/**
 * Build calendar weeks for a given month, with teaching-week annotations.
 * Each week: { weekLabel, days: [{ date:Date, dayOfMonth, inMonth, isToday, isoDate }] }
 * Weeks start on Monday.
 * @param {number} year
 * @param {number} month - 0-based
 * @param {object|null} semester
 * @returns {Array}
 */
export function getWeeksInMonth(year, month, semester) {
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);

  // Monday-based: 0=Mon … 6=Sun
  let startDow = (firstOfMonth.getDay() + 6) % 7;
  const startDate = new Date(year, month, 1 - startDow);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = toISO(today);

  const weeks = [];
  let current = new Date(startDate);

  while (true) {
    const days = [];
    let mondayDate = new Date(current);
    for (let i = 0; i < 7; i++) {
      const d = new Date(current);
      days.push({
        date: d,
        dayOfMonth: d.getDate(),
        inMonth: d.getMonth() === month,
        isToday: toISO(d) === todayISO,
        isoDate: toISO(d),
      });
      current.setDate(current.getDate() + 1);
    }

    // Teaching week label for the Monday of this row
    const wk = getTeachingWeekForDate(semester, mondayDate);

    weeks.push({ weekLabel: wk.label, days });

    // Stop if we've passed the last day of the month
    if (current > lastOfMonth && current.getDay() === 1) break;
    // Safety: max 6 rows
    if (weeks.length >= 6) break;
  }

  return weeks;
}

/**
 * Build calendar weeks for a date range (inclusive), split into Monday-based rows.
 * Each week: { weekLabel, days: [{ date:Date, dayOfMonth, inRange, isToday, isoDate }] }
 *
 * @param {string} startISO - YYYY-MM-DD
 * @param {string} endISO - YYYY-MM-DD
 * @returns {Array}
 */
export function getWeeksInRange(startISO, endISO) {
  const start = toLocal(startISO);
  const end = toLocal(endISO);
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) return [];
  if (!(end instanceof Date) || Number.isNaN(end.getTime())) return [];

  // Normalize to midnight local
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  // Find Monday of the week containing start
  const startDow = (start.getDay() + 6) % 7; // 0=Mon
  const cursor = new Date(start);
  cursor.setDate(cursor.getDate() - startDow);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = toISO(today);

  const weeks = [];

  while (true) {
    const days = [];
    const monday = new Date(cursor);
    for (let i = 0; i < 7; i++) {
      const d = new Date(cursor);
      const iso = toISO(d);
      const inRange = d >= start && d <= end;
      days.push({
        date: d,
        dayOfMonth: d.getDate(),
        inRange,
        isToday: iso === todayISO,
        isoDate: iso,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    weeks.push({ weekLabel: '', days });

    // Stop once we've completed the week that contains `end`
    if (monday > end) break;
    // Safety
    if (weeks.length > 12) break;
  }

  // Trim leading/trailing weeks that have no inRange days
  while (weeks.length && weeks[0].days.every(d => !d.inRange)) weeks.shift();
  while (weeks.length && weeks[weeks.length - 1].days.every(d => !d.inRange)) weeks.pop();

  return weeks;
}

// ── Relative time ────────────────────────────────────────────────────────────

/**
 * Human-readable relative days until a date.
 * @param {string} dateString - ISO date
 * @returns {string}
 */
export function daysUntil(dateString) {
  const target = toLocal(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = Math.round((target - today) / (1000 * 60 * 60 * 24));
  if (days < 0) return 'proběhlo';
  if (days === 0) return 'dnes';
  if (days === 1) return 'zítra';
  return `za ${days}d`;
}

// ── Formatting ───────────────────────────────────────────────────────────────

/**
 * Format a date string to Czech format: "15. března 2026"
 * @param {string} dateString
 * @returns {string}
 */
export function formatDateCZ(dateString) {
  const d = toLocal(dateString);
  return `${d.getDate()}. ${CZ_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Get short month name for date boxes.
 * @param {string} dateString
 * @returns {{ day: number, month: string }}
 */
export function getDateParts(dateString) {
  const d = toLocal(dateString);
  return {
    day: d.getDate(),
    month: CZ_MONTHS_SHORT[d.getMonth()],
  };
}
