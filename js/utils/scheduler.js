/* ==========================================================================
   StudyHub — Deterministic constraint-based exam scheduler
   ========================================================================== */

/**
 * Schedule exams deterministically with hard constraint enforcement.
 *
 * @param {{ courses: Array<{ code: string, name: string, credits: number, examDates: Array<{ date: string, time: string, id: string }> }>, rules: { maxPerWeek?: number, minDaysBetween?: number, preferEarly?: boolean, blockedRanges?: Array<{ from: string, to: string, reason?: string }>, priorityCourses?: string[] } }} input
 * @returns {{ success: boolean, schedule: Array<{ code: string, name: string, selectedDate: string, selectedTime: string, examId: string, weekNumber: number }>, warnings: string[], unscheduled: string[] }}
 */
export function scheduleExams(input) {
  const { courses, rules } = input;
  const maxPerWeek = rules.maxPerWeek ?? 1;
  const minDaysBetween = rules.minDaysBetween ?? 5;
  const preferEarly = rules.preferEarly !== false;
  const blockedRanges = rules.blockedRanges || [];
  const priorityCodes = new Set(rules.priorityCourses || []);

  // Sort courses by priority
  const sorted = [...courses].sort((a, b) => {
    const aPri = priorityCodes.has(a.code) ? 0 : 1;
    const bPri = priorityCodes.has(b.code) ? 0 : 1;
    if (aPri !== bPri) return aPri - bPri;
    // Fewer available dates → schedule first (more constrained)
    if (a.examDates.length !== b.examDates.length) return a.examDates.length - b.examDates.length;
    // More credits → schedule first
    return (b.credits || 0) - (a.credits || 0);
  });

  // Sort each course's dates chronologically (or reverse if preferEarly=false)
  for (const c of sorted) {
    c.examDates = [...c.examDates].sort((a, b) => {
      const cmp = a.date.localeCompare(b.date) || a.time.localeCompare(b.time);
      return preferEarly ? cmp : -cmp;
    });
  }

  // State
  const schedule = [];          // successful assignments
  const weekCounts = {};        // weekKey → count
  const scheduledDates = [];    // ISO dates of scheduled exams
  const unscheduled = [];
  const warnings = [];
  const courseNameByCode = {};
  for (const c of courses) courseNameByCode[c.code] = c.name;

  // Greedy assignment
  for (const course of sorted) {
    const picked = pickDate(course, schedule, weekCounts, scheduledDates, maxPerWeek, minDaysBetween, blockedRanges);
    if (picked) {
      schedule.push(picked);
      const wk = getWeekKey(picked.selectedDate);
      weekCounts[wk] = (weekCounts[wk] || 0) + 1;
      scheduledDates.push(picked.selectedDate);
    } else {
      unscheduled.push(course.code);
    }
  }

  // Backtracking: try to resolve unscheduled courses (1 level)
  const stillUnscheduled = [];
  for (const uCode of unscheduled) {
    const uCourse = sorted.find(c => c.code === uCode);
    if (!uCourse) { stillUnscheduled.push(uCode); continue; }

    let resolved = false;
    // Try each date of the unscheduled course
    for (const candidate of uCourse.examDates) {
      if (isInBlockedRange(candidate.date, blockedRanges)) continue;

      // Find which scheduled items conflict
      const conflicts = findConflicts(candidate.date, schedule, maxPerWeek, minDaysBetween, weekCounts);
      if (conflicts.length === 0) {
        // No conflict but was unscheduled — shouldn't happen, but handle gracefully
        addToSchedule(schedule, weekCounts, scheduledDates, uCourse, candidate);
        resolved = true;
        break;
      }

      // Try moving each conflicting course to an alternative date
      if (conflicts.length === 1) {
        const conflicting = conflicts[0];
        const conflictCourse = sorted.find(c => c.code === conflicting.code);
        if (!conflictCourse) continue;

        // Temporarily remove conflicting from schedule
        const removed = removeFromSchedule(schedule, weekCounts, scheduledDates, conflicting.code);
        if (!removed) continue;

        // Can the unscheduled course take this slot now?
        const uPicked = pickDate(uCourse, schedule, weekCounts, scheduledDates, maxPerWeek, minDaysBetween, blockedRanges);
        if (uPicked) {
          // Add unscheduled course
          addToSchedule(schedule, weekCounts, scheduledDates, null, uPicked);

          // Try to re-place the conflicting course
          const rePicked = pickDate(conflictCourse, schedule, weekCounts, scheduledDates, maxPerWeek, minDaysBetween, blockedRanges);
          if (rePicked) {
            addToSchedule(schedule, weekCounts, scheduledDates, null, rePicked);
            resolved = true;
            break;
          } else {
            // Revert: remove unscheduled, re-add conflicting
            removeFromSchedule(schedule, weekCounts, scheduledDates, uCourse.code);
            addToSchedule(schedule, weekCounts, scheduledDates, null, removed);
          }
        } else {
          // Revert
          addToSchedule(schedule, weekCounts, scheduledDates, null, removed);
        }
      }
    }

    if (!resolved) {
      stillUnscheduled.push(uCode);
    }
  }

  // Generate warnings
  // Check for close exams
  const sortedSchedule = [...schedule].sort((a, b) => a.selectedDate.localeCompare(b.selectedDate));
  for (let i = 1; i < sortedSchedule.length; i++) {
    const gap = daysBetween(sortedSchedule[i - 1].selectedDate, sortedSchedule[i].selectedDate);
    if (gap < minDaysBetween) {
      const nameA = courseNameByCode[sortedSchedule[i - 1].code] || sortedSchedule[i - 1].code;
      const nameB = courseNameByCode[sortedSchedule[i].code] || sortedSchedule[i].code;
      warnings.push(`${nameA} a ${nameB} jsou jen ${gap} ${gap === 1 ? 'den' : gap < 5 ? 'dny' : 'dní'} od sebe (doporučeno min. ${minDaysBetween}).`);
    }
  }

  // Check for overloaded weeks
  for (const [wk, count] of Object.entries(weekCounts)) {
    if (count > maxPerWeek) {
      const weekRange = weekKeyToRange(wk);
      warnings.push(`Týden ${weekRange} máš ${count} zkoušek (požadováno max. ${maxPerWeek}, ale nebylo jiné řešení).`);
    }
  }

  // Unscheduled warnings
  for (const code of stillUnscheduled) {
    const name = courseNameByCode[code] || code;
    warnings.push(`Pro ${name} (${code}) nebyl nalezen volný termín — zkus přidat více termínů nebo uvolnit pravidla.`);
  }

  return {
    success: stillUnscheduled.length === 0,
    schedule: sortedSchedule.map(s => ({ ...s, weekNumber: getISOWeekNumber(s.selectedDate) })),
    warnings,
    unscheduled: stillUnscheduled,
  };
}

// ── Internal helpers ────────────────────────────────────────────────────────

function pickDate(course, schedule, weekCounts, scheduledDates, maxPerWeek, minDaysBetween, blockedRanges) {
  for (const ed of course.examDates) {
    if (isInBlockedRange(ed.date, blockedRanges)) continue;

    const wk = getWeekKey(ed.date);
    if ((weekCounts[wk] || 0) >= maxPerWeek) continue;

    const tooClose = scheduledDates.some(sd => daysBetween(sd, ed.date) < minDaysBetween);
    if (tooClose) continue;

    return {
      code: course.code,
      name: course.name,
      selectedDate: ed.date,
      selectedTime: ed.time || '',
      examId: ed.id || '',
      weekNumber: 0,
    };
  }
  return null;
}

function findConflicts(date, schedule, maxPerWeek, minDaysBetween, weekCounts) {
  const wk = getWeekKey(date);
  const conflicts = [];

  // Week overload conflicts
  if ((weekCounts[wk] || 0) >= maxPerWeek) {
    for (const s of schedule) {
      if (getWeekKey(s.selectedDate) === wk) conflicts.push(s);
    }
  }

  // Too-close conflicts
  for (const s of schedule) {
    if (daysBetween(s.selectedDate, date) < minDaysBetween) {
      if (!conflicts.find(c => c.code === s.code)) conflicts.push(s);
    }
  }

  return conflicts;
}

function addToSchedule(schedule, weekCounts, scheduledDates, course, entry) {
  const item = entry.selectedDate ? entry : {
    code: course.code,
    name: course.name,
    selectedDate: entry.date,
    selectedTime: entry.time || '',
    examId: entry.id || '',
    weekNumber: 0,
  };
  schedule.push(item);
  const wk = getWeekKey(item.selectedDate);
  weekCounts[wk] = (weekCounts[wk] || 0) + 1;
  scheduledDates.push(item.selectedDate);
}

function removeFromSchedule(schedule, weekCounts, scheduledDates, code) {
  const idx = schedule.findIndex(s => s.code === code);
  if (idx < 0) return null;
  const removed = schedule.splice(idx, 1)[0];
  const wk = getWeekKey(removed.selectedDate);
  weekCounts[wk] = Math.max(0, (weekCounts[wk] || 0) - 1);
  const di = scheduledDates.indexOf(removed.selectedDate);
  if (di >= 0) scheduledDates.splice(di, 1);
  return removed;
}

function getWeekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = (d.getDay() + 6) % 7; // 0=Mon
  const monday = new Date(d);
  monday.setDate(monday.getDate() - dow);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const day = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function weekKeyToRange(weekKey) {
  const monday = new Date(weekKey + 'T00:00:00');
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const fmtD = (d) => `${d.getDate()}.${d.getMonth() + 1}.`;
  return `${fmtD(monday)}–${fmtD(sunday)}`;
}

function daysBetween(dateA, dateB) {
  const a = new Date(dateA + 'T00:00:00');
  const b = new Date(dateB + 'T00:00:00');
  return Math.abs(Math.round((b - a) / (1000 * 60 * 60 * 24)));
}

function isInBlockedRange(dateStr, blockedRanges) {
  const d = new Date(dateStr + 'T00:00:00');
  for (const range of blockedRanges) {
    const from = new Date(range.from + 'T00:00:00');
    const to = new Date(range.to + 'T00:00:00');
    if (d >= from && d <= to) return true;
  }
  return false;
}

function getISOWeekNumber(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const thursday = new Date(d);
  thursday.setDate(thursday.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(thursday.getFullYear(), 0, 1);
  return Math.ceil(((thursday - yearStart) / (1000 * 60 * 60 * 24) + 1) / 7);
}
