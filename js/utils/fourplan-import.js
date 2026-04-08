/* ==========================================================================
   StudyHub — 4plan study plan importer
   ========================================================================== */

/**
 * Parse a 4plan study plan JSON export.
 *
 * Expected input format (array of semesters with courses):
 * [
 *   {
 *     "semester": 1,
 *     "courses": [
 *       { "code": "4IT115", "name": "Softwarové inženýrství", "credits": 6, "type": "povinny" },
 *       ...
 *     ]
 *   },
 *   ...
 * ]
 *
 * Also accepts a flat array of courses with a `semester` field on each course:
 * [
 *   { "code": "4IT115", "name": "...", "credits": 6, "semester": 1, "type": "povinny" },
 *   ...
 * ]
 *
 * @param {string} jsonString - Raw JSON string from 4plan export
 * @returns {{ semesters: Array<{ number: number, courses: Array }>, totalCredits: number, programName: string }}
 */
export function parseFourPlanJSON(jsonString) {
  const raw = JSON.parse(jsonString);

  let semesters = [];
  let programName = '';

  // Format A (real 4plan): object with semesters as { "semester-1": ["CODE1", ...], ... }
  if (raw && !Array.isArray(raw) && raw.semesters && !Array.isArray(raw.semesters) && typeof raw.semesters === 'object') {
    programName = raw.programName || raw.program || '';
    for (const [key, codes] of Object.entries(raw.semesters)) {
      const num = Number(key.replace(/\D/g, '')) || 0;
      if (!Array.isArray(codes) || num === 0) continue;
      // Codes can be strings ("4IT115") or objects ({ code, name, ... })
      const courses = codes.map(c => typeof c === 'string' ? { code: c } : c);
      semesters.push({ number: num, courses: normalizeCourses(courses) });
    }
  }
  // Format B: object with metadata + semesters as array of { semester, courses }
  else if (raw && !Array.isArray(raw) && Array.isArray(raw.semesters)) {
    programName = raw.programName || raw.program || '';
    semesters = raw.semesters.map(s => ({
      number: s.semester || s.number || 0,
      courses: normalizeCourses(s.courses || []),
    }));
  }
  // Format C: array of semester objects with courses array
  else if (Array.isArray(raw) && raw.length > 0 && Array.isArray(raw[0]?.courses)) {
    semesters = raw.map(s => ({
      number: s.semester || s.number || 0,
      courses: normalizeCourses(s.courses || []),
    }));
  }
  // Format D: flat array of courses with semester field
  else if (Array.isArray(raw)) {
    const bySemester = new Map();
    for (const item of raw) {
      const num = item.semester || item.semesterNumber || 1;
      if (!bySemester.has(num)) bySemester.set(num, []);
      bySemester.get(num).push(item);
    }
    semesters = [...bySemester.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([num, courses]) => ({ number: num, courses: normalizeCourses(courses) }));
  }

  // Sort semesters by number
  semesters.sort((a, b) => a.number - b.number);

  const totalCredits = semesters.reduce(
    (sum, s) => sum + s.courses.reduce((cs, c) => cs + (c.credits || 0), 0),
    0
  );

  return { semesters, totalCredits, programName };
}

/**
 * Normalize course objects to a consistent shape.
 * @param {Array} courses
 * @returns {Array<{ code: string, name: string, credits: number, group: string }>}
 */
function normalizeCourses(courses) {
  return courses.map(c => ({
    code: (c.code || c.courseCode || '').trim().toUpperCase(),
    name: (c.name || c.courseName || c.title || '').trim(),
    credits: Number(c.credits || c.ects || 0),
    group: normalizeGroup(c.type || c.group || c.category || ''),
  }));
}

/**
 * Normalize course group/type to one of: povinny, povinne-volitelny, volitelny.
 * @param {string} raw
 * @returns {string}
 */
function normalizeGroup(raw) {
  const lower = raw.toLowerCase().trim();
  if (lower.includes('povinně volitelný') || lower.includes('povinne-volitelny') || lower.includes('pv') || lower === 'b') {
    return 'povinne-volitelny';
  }
  if (lower.includes('volitelný') || lower.includes('volitelny') || lower === 'c') {
    return 'volitelny';
  }
  return 'povinny';
}

/**
 * Map a study plan semester number to an academic semester string.
 * Odd semesters = ZS, even semesters = LS.
 *
 * @param {number} semesterNumber - 1-based semester number in the plan
 * @param {string} startYear - Academic year the student started (e.g. "2024")
 * @returns {string} e.g. "ZS 2024/25", "LS 2024/25", "ZS 2025/26"
 */
export function semesterNumberToAcademic(semesterNumber, startYear) {
  const year = Number(startYear);
  // Semester 1 = ZS of startYear, Semester 2 = LS of startYear, etc.
  const yearOffset = Math.floor((semesterNumber - 1) / 2);
  const isWinter = semesterNumber % 2 === 1;

  const academicYear = year + yearOffset;
  const shortNext = String(academicYear + 1).slice(-2);
  const label = `${isWinter ? 'ZS' : 'LS'} ${academicYear}/${shortNext}`;
  return label;
}

/**
 * Detect the current semester number based on today's date and study start year.
 * @param {string} startYear
 * @param {Date} [today]
 * @returns {number}
 */
export function detectCurrentSemester(startYear, today = new Date()) {
  const year = Number(startYear);
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-based

  // Academic year starts in September
  // ZS: Sep-Jan, LS: Feb-Aug
  const isWinterHalf = currentMonth >= 8 || currentMonth <= 0; // Sep-Jan
  const academicYear = currentMonth >= 8 ? currentYear : currentYear - 1;
  const yearOffset = academicYear - year;
  const semesterNumber = yearOffset * 2 + (isWinterHalf ? 1 : 2);

  return Math.max(1, semesterNumber);
}
