/* ==========================================================================
   StudyHub — Scheduler tests (run in browser console or via import)
   ========================================================================== */

import { scheduleExams } from './scheduler.js';

function assert(condition, msg) {
  if (!condition) console.error(`FAIL: ${msg}`);
  else console.log(`PASS: ${msg}`);
}

// ── Test a) 5 courses, max 1/week, min 5 days ─────────────────────────────

function testBasicScheduling() {
  // Each course has dates spread across 5 different weeks with enough spacing
  const input = {
    courses: [
      { code: 'A', name: 'Course A', credits: 6, examDates: [
        { date: '2026-05-18', time: '09:00', id: '1' },
        { date: '2026-05-25', time: '09:00', id: '2' },
        { date: '2026-06-08', time: '09:00', id: '3' },
      ]},
      { code: 'B', name: 'Course B', credits: 5, examDates: [
        { date: '2026-05-25', time: '10:00', id: '4' },
        { date: '2026-06-01', time: '10:00', id: '5' },
        { date: '2026-06-15', time: '10:00', id: '6' },
      ]},
      { code: 'C', name: 'Course C', credits: 4, examDates: [
        { date: '2026-06-01', time: '11:00', id: '7' },
        { date: '2026-06-08', time: '11:00', id: '8' },
        { date: '2026-06-22', time: '11:00', id: '9' },
      ]},
      { code: 'D', name: 'Course D', credits: 3, examDates: [
        { date: '2026-06-08', time: '12:00', id: '10' },
        { date: '2026-06-15', time: '12:00', id: '11' },
        { date: '2026-06-22', time: '12:00', id: '12' },
      ]},
      { code: 'E', name: 'Course E', credits: 2, examDates: [
        { date: '2026-06-15', time: '13:00', id: '13' },
        { date: '2026-06-22', time: '13:00', id: '14' },
        { date: '2026-06-29', time: '13:00', id: '15' },
      ]},
    ],
    rules: { maxPerWeek: 1, minDaysBetween: 5, preferEarly: true, blockedRanges: [], priorityCourses: [] },
  };

  const result = scheduleExams(input);
  console.group('Test a) 5 courses, max 1/week, min 5 days');
  assert(result.success, 'All courses scheduled');
  assert(result.schedule.length === 5, `Scheduled 5 courses (got ${result.schedule.length})`);
  assert(result.unscheduled.length === 0, `No unscheduled (got ${result.unscheduled.length})`);

  // Check all in different weeks
  const weeks = result.schedule.map(s => s.weekNumber);
  const uniqueWeeks = new Set(weeks);
  assert(uniqueWeeks.size === 5, `All in different weeks (got ${uniqueWeeks.size} unique weeks)`);

  // Check min days between
  const sorted = [...result.schedule].sort((a, b) => a.selectedDate.localeCompare(b.selectedDate));
  let minGap = Infinity;
  for (let i = 1; i < sorted.length; i++) {
    const gap = Math.abs(Math.round((new Date(sorted[i].selectedDate) - new Date(sorted[i-1].selectedDate)) / 86400000));
    minGap = Math.min(minGap, gap);
  }
  assert(minGap >= 5, `Min gap >= 5 days (got ${minGap})`);
  console.log('Schedule:', result.schedule.map(s => `${s.code}: ${s.selectedDate}`));
  console.groupEnd();
}

// ── Test b) 2 courses with same single date ───────────────────────────────

function testConflictingSingleDate() {
  const input = {
    courses: [
      { code: 'X', name: 'Course X', credits: 5, examDates: [
        { date: '2026-06-01', time: '09:00', id: '1' },
      ]},
      { code: 'Y', name: 'Course Y', credits: 4, examDates: [
        { date: '2026-06-01', time: '14:00', id: '2' },
      ]},
    ],
    rules: { maxPerWeek: 1, minDaysBetween: 5, preferEarly: true, blockedRanges: [], priorityCourses: [] },
  };

  const result = scheduleExams(input);
  console.group('Test b) 2 courses, same single date');
  assert(result.schedule.length + result.unscheduled.length === 2, 'Total = 2');
  assert(result.unscheduled.length >= 1, `At least 1 unscheduled (got ${result.unscheduled.length})`);
  assert(result.warnings.length > 0, `Has warnings (got ${result.warnings.length})`);
  console.log('Scheduled:', result.schedule.map(s => `${s.code}: ${s.selectedDate}`));
  console.log('Unscheduled:', result.unscheduled);
  console.log('Warnings:', result.warnings);
  console.groupEnd();
}

// ── Test c) Blocked range covers all dates ────────────────────────────────

function testBlockedRange() {
  const input = {
    courses: [
      { code: 'Z', name: 'Course Z', credits: 6, examDates: [
        { date: '2026-06-15', time: '09:00', id: '1' },
        { date: '2026-06-18', time: '09:00', id: '2' },
        { date: '2026-06-22', time: '09:00', id: '3' },
      ]},
      { code: 'W', name: 'Course W', credits: 4, examDates: [
        { date: '2026-06-25', time: '10:00', id: '4' },
      ]},
    ],
    rules: {
      maxPerWeek: 1, minDaysBetween: 5, preferEarly: true,
      blockedRanges: [{ from: '2026-06-10', to: '2026-06-23', reason: 'Dovolená' }],
      priorityCourses: [],
    },
  };

  const result = scheduleExams(input);
  console.group('Test c) Blocked range covers all dates of one course');
  assert(result.unscheduled.includes('Z'), `Course Z is unscheduled`);
  assert(result.schedule.some(s => s.code === 'W'), `Course W is scheduled`);
  assert(result.warnings.some(w => w.includes('Z')), `Warning mentions Z`);
  console.log('Scheduled:', result.schedule.map(s => `${s.code}: ${s.selectedDate}`));
  console.log('Unscheduled:', result.unscheduled);
  console.log('Warnings:', result.warnings);
  console.groupEnd();
}

// ── Test d) preferEarly true vs false ─────────────────────────────────────

function testPreferEarly() {
  const courses = [
    { code: 'P', name: 'Course P', credits: 5, examDates: [
      { date: '2026-05-20', time: '09:00', id: '1' },
      { date: '2026-06-10', time: '09:00', id: '2' },
      { date: '2026-06-25', time: '09:00', id: '3' },
    ]},
  ];

  const early = scheduleExams({
    courses: [...courses],
    rules: { maxPerWeek: 2, minDaysBetween: 0, preferEarly: true, blockedRanges: [], priorityCourses: [] },
  });

  const late = scheduleExams({
    courses: [...courses],
    rules: { maxPerWeek: 2, minDaysBetween: 0, preferEarly: false, blockedRanges: [], priorityCourses: [] },
  });

  console.group('Test d) preferEarly true vs false');
  assert(early.schedule[0].selectedDate === '2026-05-20', `Early picks earliest date (got ${early.schedule[0]?.selectedDate})`);
  assert(late.schedule[0].selectedDate === '2026-06-25', `Late picks latest date (got ${late.schedule[0]?.selectedDate})`);
  console.groupEnd();
}

// ── Run all ─────────────────────────────────────────────────────────────────

export function runSchedulerTests() {
  console.group('=== Scheduler Tests ===');
  testBasicScheduling();
  testConflictingSingleDate();
  testBlockedRange();
  testPreferEarly();
  console.groupEnd();
}

// Auto-run if loaded directly
runSchedulerTests();
