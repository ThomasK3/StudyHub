/* ==========================================================================
   StudyHub — Data store with localStorage persistence
   ========================================================================== */

const KEYS = {
  courses:        'studyhub_courses',
  semester:       'studyhub_semester',
  settings:       'studyhub_settings',
  planner:        'studyhub_planner',
  studyPlan:      'studyhub_studyplan',
  activeSemester: 'studyhub_active_semester',
};

/**
 * Read a key from localStorage, return parsed JSON or fallback.
 * @param {string} key
 * @param {*} fallback
 * @returns {*}
 */
function load(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Write a value to localStorage as JSON.
 * @param {string} key
 * @param {*} value
 */
function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ── Courses ──────────────────────────────────────────────────────────────────

/**
 * @returns {Array} All saved courses.
 */
export function getCourses() {
  return load(KEYS.courses, []);
}

/**
 * @param {string} id
 * @returns {object|undefined}
 */
export function getCourse(id) {
  return getCourses().find(c => c.id === id);
}

/**
 * Save or update a course. Assigns id and lastUpdated automatically.
 * @param {object} course
 * @returns {object} The saved course.
 */
export function saveCourse(course) {
  const courses = getCourses();
  const now = new Date().toISOString();

  if (!course.id) {
    course.id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  }
  course.lastUpdated = now;

  const idx = courses.findIndex(c => c.id === course.id);
  if (idx >= 0) {
    courses[idx] = course;
  } else {
    courses.push(course);
  }

  save(KEYS.courses, courses);
  return course;
}

/**
 * Delete a course by id.
 * @param {string} id
 */
export function deleteCourse(id) {
  const courses = getCourses().filter(c => c.id !== id);
  save(KEYS.courses, courses);
}

/**
 * Update progress for a course component.
 * @param {string} courseId
 * @param {number} componentIndex
 * @param {{ earned?: number|null, completed?: boolean }} update
 */
export function updateProgress(courseId, componentIndex, update) {
  const course = getCourse(courseId);
  if (!course) return;
  const comps = course.components || [];
  if (!Array.isArray(course.progress) || course.progress.length !== comps.length) {
    course.progress = comps.map(() => ({ componentIndex: 0, earned: null, completed: false }));
    course.progress.forEach((p, i) => { p.componentIndex = i; });
  }
  if (componentIndex < 0 || componentIndex >= course.progress.length) return;
  Object.assign(course.progress[componentIndex], update);
  saveCourse(course);
}

/**
 * Get normalized progress array for a course (always matches components length).
 * @param {object} course
 * @returns {Array<{ componentIndex: number, earned: number|null, completed: boolean }>}
 */
export function getProgress(course) {
  const comps = course?.components || [];
  if (Array.isArray(course?.progress) && course.progress.length === comps.length) {
    return course.progress;
  }
  return comps.map((_, i) => ({ componentIndex: i, earned: null, completed: false }));
}

/**
 * Update selectedSchedule indices for a course.
 * @param {string} courseId
 * @param {number[]} selectedSchedule
 */
export function updateScheduleSelection(courseId, selectedSchedule) {
  const course = getCourse(courseId);
  if (!course) return;
  course.selectedSchedule = selectedSchedule;
  saveCourse(course);
}

// ── Semester ─────────────────────────────────────────────────────────────────

/**
 * @returns {object|null}
 */
export function getSemester() {
  return load(KEYS.semester, null);
}

/**
 * @param {object} semester
 */
export function setSemester(semester) {
  save(KEYS.semester, semester);
}

// ── Settings ─────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  apiKey: '',
  theme: 'light',
  activeSemesterNumber: null,
};

/**
 * @returns {object}
 */
export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...load(KEYS.settings, {}) };
}

/**
 * Merge partial updates into settings.
 * @param {object} partial
 */
export function updateSettings(partial) {
  const settings = getSettings();
  Object.assign(settings, partial);
  save(KEYS.settings, settings);
}

// ── Events (derived) ────────────────────────────────────────────────────────

/**
 * Collect all events from all courses, enriched with course info.
 * @returns {Array}
 */
export function getAllEvents() {
  const label = getActiveSemesterLabel();
  const courses = label ? getCoursesForSemester(label) : getCourses();
  const events = [];

  for (const course of courses) {
    if (!Array.isArray(course.events)) continue;
    for (const event of course.events) {
      events.push({
        ...event,
        courseId: course.id,
        courseCode: course.code,
        courseName: course.name,
        courseCredits: course.credits,
      });
    }
  }

  events.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return events;
}

// ── Study plan ──────────────────────────────────────────────────────────────

const DEFAULT_STUDY_PLAN = {
  startYear: '',
  programName: '',
  semesters: [],
  importedAt: null,
};

/**
 * @returns {{ startYear: string, programName: string, semesters: Array, importedAt: string|null }}
 */
export function getStudyPlan() {
  return { ...DEFAULT_STUDY_PLAN, ...load(KEYS.studyPlan, {}) };
}

/**
 * Save imported study plan data.
 * @param {{ startYear: string, programName: string, semesters: Array }} plan
 */
export function saveStudyPlan(plan) {
  save(KEYS.studyPlan, { ...plan, importedAt: new Date().toISOString() });
}

/**
 * Get the active semester number from settings.
 * @returns {number|null}
 */
export function getActiveSemesterNumber() {
  return getSettings().activeSemesterNumber || null;
}

/**
 * Set the active semester number.
 * @param {number|null} num
 */
export function setActiveSemesterNumber(num) {
  updateSettings({ activeSemesterNumber: num });
}

/**
 * Get courses filtered by the active semester (matching semester string).
 * If no active semester is set, returns all courses.
 * @param {string} [semesterLabel] - e.g. "LS 2025/26"
 * @returns {Array}
 */
export function getCoursesForSemester(semesterLabel) {
  const courses = getCourses();
  if (!semesterLabel) return courses;
  return courses.filter(c => c.semester === semesterLabel);
}

/**
 * Get the active semester label (e.g. "LS 2025/26"), or null for "all semesters".
 * @returns {string|null}
 */
export function getActiveSemesterLabel() {
  return load(KEYS.activeSemester, null);
}

/**
 * Persist the active semester label. Pass null to show all semesters.
 * @param {string|null} label
 */
export function setActiveSemesterLabel(label) {
  save(KEYS.activeSemester, label);
}

/**
 * Derive the sorted list of unique semester labels from the user's actual course data.
 * Returns labels like "ZS 2025/26", "LS 2025/26" sorted oldest-first.
 * @returns {string[]}
 */
export function getAvailableSemesters() {
  const seen = new Set();
  const result = [];
  for (const c of getCourses()) {
    if (c.semester && !seen.has(c.semester)) {
      seen.add(c.semester);
      result.push(c.semester);
    }
  }
  return result.sort((a, b) => {
    // Parse "ZS 2025/26" → sort key: year * 10 + (ZS=1, LS=2)
    const key = s => {
      const m = s.match(/^(ZS|LS)\s+(\d{4})\/\d{2}$/);
      if (!m) return 0;
      return parseInt(m[2]) * 10 + (m[1] === 'ZS' ? 1 : 2);
    };
    return key(a) - key(b);
  });
}

/**
 * Import courses from a parsed 4plan semester into the store.
 * Only adds courses that don't already exist (by code + semester).
 * @param {Array<{ code: string, name: string, credits: number, group: string }>} planCourses
 * @param {string} semesterLabel - e.g. "LS 2025/26"
 * @returns {{ added: number, skipped: number }}
 */
export function importFourPlanCourses(planCourses, semesterLabel) {
  const existing = getCourses();
  let added = 0;
  let skipped = 0;

  for (const pc of planCourses) {
    const alreadyExists = existing.some(
      c => c.code.toUpperCase() === pc.code.toUpperCase() && c.semester === semesterLabel
    );
    if (alreadyExists) {
      skipped++;
      continue;
    }

    saveCourse({
      code: pc.code,
      name: pc.name,
      credits: pc.credits,
      semester: semesterLabel,
      group: pc.group,
      lecturer: '',
      description: '',
      aiSummary: '',
      learningOutcomes: [],
      weeklyTopics: [],
      workload: { lectures: 0, seminars: 0, project: 0, testPrep: 0, examPrep: 0, total: 0 },
      schedule: [],
      allLecturers: [],
      literature: { required: [], recommended: [] },
      components: [],
      events: [],
      requirements: [],
      gradingScale: [
        { grade: '1', label: 'Výborně', minPercent: 90 },
        { grade: '2', label: 'Velmi dobře', minPercent: 75 },
        { grade: '3', label: 'Dobře', minPercent: 60 },
        { grade: '4', label: 'Nevyhověl', minPercent: 0 },
      ],
      notes: '',
      insisUrl: '',
      source: 'fourplan',
    });
    added++;
  }

  return { added, skipped };
}

// ── Export / Import ──────────────────────────────────────────────────────────

/**
 * Export all data as a JSON string.
 * @returns {string}
 */
export function exportData() {
  return JSON.stringify({
    courses: getCourses(),
    semester: getSemester(),
    settings: getSettings(),
    planner: getPlanner(),
    studyPlan: getStudyPlan(),
    exportedAt: new Date().toISOString(),
  }, null, 2);
}

/**
 * Import data from a JSON string. Replaces all existing data.
 * @param {string} json
 */
export function importData(json) {
  const data = JSON.parse(json);
  if (Array.isArray(data.courses)) save(KEYS.courses, data.courses);
  if (data.semester) save(KEYS.semester, data.semester);
  if (data.settings) save(KEYS.settings, data.settings);
  if (data.planner) save(KEYS.planner, data.planner);
  if (data.studyPlan) save(KEYS.studyPlan, data.studyPlan);
}

// ── Exam planner ─────────────────────────────────────────────────────────────

const DEFAULT_PLANNER = {
  rawText: '',
  terms: [],
  selectedByCourse: {},
};

/**
 * @returns {{ rawText: string, terms: Array, selectedByCourse: Record<string,string> }}
 */
export function getPlanner() {
  return { ...DEFAULT_PLANNER, ...load(KEYS.planner, {}) };
}

/**
 * Merge partial updates into planner state.
 * @param {object} partial
 */
export function updatePlanner(partial) {
  const planner = getPlanner();
  Object.assign(planner, partial);
  save(KEYS.planner, planner);
}

// ── Demo seed ────────────────────────────────────────────────────────────────

const DEMO_COURSES = [
  {
    id: 'demo-4it115',
    code: '4IT115',
    name: 'Softwarové inženýrství',
    credits: 6,
    semester: 'LS 2025/26',
    group: 'povinny',
    lecturer: 'Doc. Ing. Voříšek',
    description: 'Předmět pokrývá základní principy softwarového inženýrství, životní cyklus SW, metodiky vývoje a řízení projektů.',
    aiSummary: '',
    learningOutcomes: [
      'Porozumět životnímu cyklu software',
      'Aplikovat agilní a vodopádové metodiky',
      'Navrhnout architekturu jednoduchého systému',
    ],
    weeklyTopics: [
      { week: 1, topic: 'Úvod do softwarového inženýrství' },
      { week: 2, topic: 'Životní cyklus software' },
      { week: 3, topic: 'Analýza požadavků' },
      { week: 4, topic: 'UML modelování' },
      { week: 5, topic: 'Návrh architektury' },
      { week: 6, topic: 'Implementace a coding standards' },
      { week: 7, topic: 'Průběžný test' },
      { week: 8, topic: 'Testování software' },
      { week: 9, topic: 'Agilní metodiky (Scrum, Kanban)' },
      { week: 10, topic: 'Řízení projektů' },
      { week: 11, topic: 'DevOps a CI/CD' },
      { week: 12, topic: 'Kvalita a metriky' },
      { week: 13, topic: 'Shrnutí, příprava na zkoušku' },
    ],
    workload: { lectures: 26, seminars: 26, project: 30, testPrep: 10, examPrep: 20, total: 112 },
    schedule: [
      { day: 'Po', time: '09:15-10:45', room: 'SB 110', type: 'lecture', teacher: 'Doc. Ing. Voříšek', frequency: 'každý', capacity: 120 },
      { day: 'St', time: '11:00-12:30', room: 'JM 372', type: 'seminar', teacher: 'Ing. Koudelka', frequency: 'každý', capacity: 24 },
    ],
    allLecturers: ['Doc. Ing. Voříšek', 'Ing. Koudelka'],
    literature: {
      required: ['Sommerville, I.: Software Engineering, 10th ed.'],
      recommended: ['Pressman, R.: Software Engineering: A Practitioner\'s Approach'],
    },
    components: [
      { name: 'Průběžný test', weight: 30, type: 'test', description: 'Test v 7. týdnu', maxScore: 30, passingScore: 15 },
      { name: 'Semestrální práce', weight: 30, type: 'project', description: 'Týmový projekt', maxScore: 30, passingScore: 15 },
      { name: 'Závěrečná zkouška', weight: 40, type: 'exam', description: 'Písemná zkouška', maxScore: 40, passingScore: 20 },
    ],
    events: [
      { id: 'e1', title: 'Průběžný test', date: '2026-04-06', time: '10:00', type: 'test', location: 'SB 110', notes: '', registered: false },
      { id: 'e2', title: 'Odevzdání projektu', date: '2026-05-11', type: 'deadline', notes: 'Odevzdat do 23:59 na InSIS', registered: false },
      { id: 'e3', title: 'Zkouška - 1. termín', date: '2026-05-25', time: '09:00', type: 'exam', location: 'SB 110', notes: '', registered: false },
    ],
    requirements: ['Získat min. 50 % z průběžného testu', 'Odevzdat semestrální práci', 'Získat min. 50 % ze zkoušky'],
    gradingScale: [
      { grade: '1', label: 'Výborně', minPercent: 90 },
      { grade: '2', label: 'Velmi dobře', minPercent: 75 },
      { grade: '3', label: 'Dobře', minPercent: 60 },
      { grade: '4', label: 'Nevyhověl', minPercent: 0 },
    ],
    notes: '',
    insisUrl: '',
    source: 'local',
    lastUpdated: '2026-02-20T10:00:00.000Z',
  },
  {
    id: 'demo-4iz110',
    code: '4IZ110',
    name: 'Základy informatiky',
    credits: 4,
    semester: 'LS 2025/26',
    group: 'povinny',
    lecturer: 'Ing. Nováková',
    description: '',
    aiSummary: '',
    learningOutcomes: [],
    weeklyTopics: [],
    workload: { lectures: 0, seminars: 0, project: 0, testPrep: 0, examPrep: 0, total: 0 },
    schedule: [],
    allLecturers: ['Ing. Nováková'],
    literature: { required: [], recommended: [] },
    components: [
      { name: 'Domácí úlohy', weight: 40, type: 'homework', description: '4 úlohy po 10 %', maxScore: 40, passingScore: 20 },
      { name: 'Závěrečná zkouška', weight: 60, type: 'exam', description: 'Kombinovaný test', maxScore: 60, passingScore: 30 },
    ],
    events: [
      { id: 'e4', title: 'Úloha 1 deadline', date: '2026-03-23', type: 'deadline', notes: '', registered: false },
      { id: 'e5', title: 'Úloha 2 deadline', date: '2026-04-13', type: 'deadline', notes: '', registered: false },
      { id: 'e6', title: 'Zkouška - 1. termín', date: '2026-06-01', time: '14:00', type: 'exam', location: 'RB 211', notes: '', registered: false },
    ],
    requirements: ['Odevzdat min. 3 ze 4 úloh', 'Získat min. 50 % ze zkoušky'],
    gradingScale: [
      { grade: '1', label: 'Výborně', minPercent: 90 },
      { grade: '2', label: 'Velmi dobře', minPercent: 75 },
      { grade: '3', label: 'Dobře', minPercent: 60 },
      { grade: '4', label: 'Nevyhověl', minPercent: 0 },
    ],
    notes: '',
    insisUrl: '',
    source: 'local',
    lastUpdated: '2026-02-20T10:00:00.000Z',
  },
];

/**
 * Deduplicate courses in localStorage by sharedId.
 * Keeps the entry with the most data (non-empty notes, progress) and removes stale duplicates.
 * Safe to call on every startup — no-op when there are no duplicates.
 */
export function deduplicateSharedCourses() {
  const courses = getCourses();
  const bySharedId = new Map();
  const unshared = [];

  for (const c of courses) {
    if (!c.sharedId) {
      unshared.push(c);
      continue;
    }
    const key = String(c.sharedId);
    if (!bySharedId.has(key)) {
      bySharedId.set(key, c);
    } else {
      // Keep whichever has more data
      const prev = bySharedId.get(key);
      const prevScore = (prev.notes ? 1 : 0) + (Array.isArray(prev.progress) ? 1 : 0);
      const curScore  = (c.notes   ? 1 : 0) + (Array.isArray(c.progress)    ? 1 : 0);
      if (curScore > prevScore) bySharedId.set(key, c);
    }
  }

  const deduped = [...unshared, ...bySharedId.values()];
  if (deduped.length < courses.length) {
    save(KEYS.courses, deduped);
  }
}

/**
 * Seed demo data if store is empty (first run).
 */
export function seedIfEmpty() {
  if (getCourses().length === 0) {
    save(KEYS.courses, DEMO_COURSES);
    setSemester({
      id: 'LS-2026',
      name: 'Letní semestr 2025/26',
      type: 'summer',
      teachingStart: '2026-02-16',
      teachingEnd: '2026-05-17',
      examStart: '2026-05-18',
      examEnd: '2026-06-28',
      holidays: [
        { date: '2026-04-03', name: 'Velký pátek' },
        { date: '2026-04-06', name: 'Velikonoční pondělí' },
        { date: '2026-05-01', name: 'Svátek práce' },
        { date: '2026-05-08', name: 'Den vítězství' },
      ],
    });
  }
}
