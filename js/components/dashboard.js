/* ==========================================================================
   StudyHub — Dashboard view
   ========================================================================== */

import { getCourses, getSemester, getAllEvents, getProgress, getStudyPlan, getActiveSemesterLabel, getCoursesForSemester } from '../store.js';
import { semesterNumberToAcademic } from '../utils/fourplan-import.js';
import { getTeachingWeek, daysUntil, getDateParts, formatDateCZ, CZ_MONTHS_NOM } from '../utils/dates.js';
import { navigate } from '../router.js';
import { isSupabaseConfigured } from '../utils/supabase.js';

const EVENT_TYPE_LABELS = {
  exam: 'Zkouška',
  test: 'Test',
  deadline: 'Deadline',
  presentation: 'Prezentace',
  other: 'Jiné',
};

const CZ_DAY_NAMES_FULL = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];
const DAY_ABBR = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];

/**
 * Render the dashboard view.
 * @param {HTMLElement} container
 */
export function renderDashboard(container) {
  const plan = getStudyPlan();
  const activeSemLabel = getActiveSemesterLabel();
  const courses = activeSemLabel ? getCoursesForSemester(activeSemLabel) : getCourses();
  const semester = getSemester();
  const allEvents = getAllEvents(); // already filtered by active semester in store

  // Teaching week
  let weekLabel = '—';
  if (semester) {
    const week = getTeachingWeek(semester.teachingStart, semester.teachingEnd);
    weekLabel = week.label;
  }

  // Upcoming events (future only, max 5)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = allEvents
    .filter(e => new Date(e.date + 'T00:00:00') >= today)
    .slice(0, 5);

  // Total credits
  const totalCredits = courses.reduce((sum, c) => sum + (c.credits || 0), 0);

  const onlineBadge = isSupabaseConfigured()
    ? '<span class="badge badge--online">Online databáze</span>'
    : '';

  container.innerHTML = `
    <div class="dashboard">
      ${onlineBadge ? `<div class="dashboard__status">${onlineBadge}</div>` : ''}
      ${renderStudyPlanInfo(plan, activeSemLabel)}
      ${renderStats(courses.length, totalCredits, weekLabel, semester)}
      ${renderCountdown(semester, allEvents)}
      ${renderTodayView(courses, allEvents)}
      ${renderUpcoming(upcoming)}
      ${renderCourseGrid(courses)}
    </div>
  `;

  // Click handlers for course cards
  container.querySelectorAll('[data-course-id]').forEach(el => {
    el.addEventListener('click', () => {
      navigate(`#/course/${el.dataset.courseId}`);
    });
  });
}

// ── Countdown ───────────────────────────────────────────────────────────────

function renderCountdown(semester, allEvents) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const boxes = [];

  if (semester?.examStart && semester?.examEnd) {
    const examStart = new Date(semester.examStart + 'T00:00:00');
    const examEnd = new Date(semester.examEnd + 'T00:00:00');

    if (today < examStart) {
      const days = Math.ceil((examStart - today) / 86400000);
      boxes.push({ value: days, label: 'Do zkouškového', color: 'var(--color-teal)' });
    } else if (today <= examEnd) {
      const days = Math.ceil((examEnd - today) / 86400000);
      boxes.push({ value: days, label: 'Zkouškové končí za', color: 'var(--color-amber)' });
    }

    if (today <= examEnd) {
      const daysToEnd = Math.ceil((examEnd - today) / 86400000);
      if (today >= examStart) {
        // Already showing exam end above
      } else {
        boxes.push({ value: daysToEnd, label: 'Do konce semestru', color: 'var(--color-muted)' });
      }
    }
  }

  // Nearest exam/test
  const nextExamEvent = allEvents.find(e => {
    const d = new Date(e.date + 'T00:00:00');
    return d >= today && (e.type === 'exam' || e.type === 'test');
  });
  if (nextExamEvent) {
    const days = Math.ceil((new Date(nextExamEvent.date + 'T00:00:00') - today) / 86400000);
    let color = 'var(--color-teal)';
    if (days <= 2) color = 'var(--color-red)';
    else if (days <= 7) color = 'var(--color-amber)';
    const label = nextExamEvent.title || (nextExamEvent.type === 'exam' ? 'Zkouška' : 'Test');
    boxes.push({ value: days, label, sublabel: nextExamEvent.courseCode, color });
  }

  if (boxes.length === 0) return '';

  const html = boxes.map(b => `
    <div class="countdown-box">
      <span class="countdown-box__value" style="color:${b.color}">${b.value === 0 ? 'Dnes' : b.value}</span>
      <span class="countdown-box__label">${b.value === 0 ? b.label : `${b.label}`}</span>
      ${b.sublabel ? `<span class="countdown-box__sublabel mono">${b.sublabel}</span>` : ''}
      ${b.value > 0 ? `<span class="countdown-box__unit">dní</span>` : ''}
    </div>
  `).join('');

  return `<div class="countdown-row">${html}</div>`;
}

// ── Today view ──────────────────────────────────────────────────────────────

function renderTodayView(courses, allEvents) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = toISO(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowISO = toISO(tomorrow);

  // Map JS day (0=Sun) to schedule day abbreviation (Po, Út, St, Čt, Pá, So, Ne)
  const schedDayMap = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
  const todayDayAbbr = schedDayMap[today.getDay()];

  // Today's classes from schedule — only selected rows (if selectedSchedule defined)
  const todayClasses = [];
  for (const c of courses) {
    if (!Array.isArray(c.schedule)) continue;
    const selected = c.selectedSchedule; // undefined = not set, [] = none selected
    c.schedule.forEach((s, i) => {
      if (s.day !== todayDayAbbr) return;
      // Show only selected; if selectedSchedule is undefined, show nothing (prompt to select)
      if (!selected || !selected.includes(i)) return;
      todayClasses.push({
        time: s.time || '',
        type: s.type === 'lecture' ? 'Přednáška' : (s.type === 'seminar' ? 'Cvičení' : (s.type || '')),
        courseName: c.name,
        courseCode: c.code,
        room: s.room || '',
      });
    });
  }
  todayClasses.sort((a, b) => a.time.localeCompare(b.time));

  // Today's / tomorrow's deadlines and tests
  const urgentEvents = allEvents.filter(e => {
    return (e.date === todayISO || e.date === tomorrowISO) && (e.type === 'deadline' || e.type === 'test' || e.type === 'exam');
  });

  if (todayClasses.length === 0 && urgentEvents.length === 0) return '';

  const dayName = CZ_DAY_NAMES_FULL[today.getDay()];
  const dateStr = `${today.getDate()}. ${CZ_MONTHS_NOM[today.getMonth()].toLowerCase()}`;

  let classesHtml = '';
  if (todayClasses.length > 0) {
    const items = todayClasses.map(c => `
      <div class="today-item">
        <span class="today-item__time mono">${c.time}</span>
        <span class="today-item__desc">${c.type} ${c.courseName}</span>
        ${c.room ? `<span class="today-item__room text-muted">${c.room}</span>` : ''}
      </div>
    `).join('');
    classesHtml = `<div class="today-classes">${items}</div>`;
  }

  let eventsHtml = '';
  if (urgentEvents.length > 0) {
    const items = urgentEvents.map(e => {
      const isToday = e.date === todayISO;
      const alertClass = isToday ? 'today-alert--red' : 'today-alert--amber';
      const when = isToday ? 'Dnes' : 'Zítra';
      return `
        <div class="today-alert ${alertClass}">
          <span class="today-alert__when">${when}</span>
          <span class="today-alert__title">${e.title}</span>
          <span class="today-alert__course mono">${e.courseCode}</span>
        </div>
      `;
    }).join('');
    eventsHtml = `<div class="today-alerts">${items}</div>`;
  }

  return `
    <section class="today-section mt-6">
      <h3 class="section-title mb-3">Dnes · <span class="accent">${dayName} ${dateStr}</span></h3>
      ${classesHtml}
      ${eventsHtml}
    </section>
  `;
}

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── Study plan info ─────────────────────────────────────────────────────────

function renderStudyPlanInfo(plan, activeSemLabel) {
  if (!plan.semesters || plan.semesters.length === 0) return '';

  const totalCredits = plan.semesters.reduce(
    (sum, s) => sum + s.courses.reduce((cs, c) => cs + (c.credits || 0), 0), 0
  );
  const totalCourses = plan.semesters.reduce((sum, s) => sum + s.courses.length, 0);

  const activeSem = (activeSemLabel && plan.startYear)
    ? plan.semesters.find(s => semesterNumberToAcademic(s.number, plan.startYear) === activeSemLabel)
    : null;
  const semInfo = activeSem
    ? `${activeSem.courses.length} předmětů, ${activeSem.courses.reduce((s, c) => s + (c.credits || 0), 0)} kr.`
    : `${totalCourses} předmětů, ${totalCredits} kr. celkem`;

  return `
    <div class="plan-info-box">
      <div class="plan-info-box__header">
        <span class="plan-info-box__title">${plan.programName || 'Studijní plán'}</span>
        <span class="text-sm text-muted">${semInfo}</span>
      </div>
    </div>
  `;
}

// ── Stats ───────────────────────────────────────────────────────────────────

function renderStats(count, credits, weekLabel, semester) {
  const semName = semester ? semester.name : '—';
  return `
    <div class="stats-row">
      <div class="stat-card">
        <span class="stat-card__value">${count}</span>
        <span class="stat-card__label">Předmětů</span>
      </div>
      <div class="stat-card">
        <span class="stat-card__value">${credits}</span>
        <span class="stat-card__label">Kreditů</span>
      </div>
      <div class="stat-card stat-card--wide">
        <span class="stat-card__value">${weekLabel}</span>
        <span class="stat-card__label">${semName}</span>
      </div>
    </div>
  `;
}

function renderUpcoming(events) {
  if (events.length === 0) {
    return `
      <section class="mt-8">
        <h3 class="section-title mb-4">Nejbližší <span class="accent">události</span></h3>
        <p class="text-muted text-sm">Žádné nadcházející události.</p>
      </section>
    `;
  }

  const cards = events.map(e => {
    const { day, month } = getDateParts(e.date);
    const rel = daysUntil(e.date);
    const typeLabel = EVENT_TYPE_LABELS[e.type] || e.type;
    return `
      <div class="event-card" data-course-id="${e.courseId}">
        <div class="event-card__date">
          <span class="event-card__day">${day}</span>
          <span class="event-card__month">${month}</span>
        </div>
        <div class="event-card__body">
          <span class="event-card__title">${e.title}</span>
          <span class="event-card__course mono">${e.courseCode}</span>
          <div class="event-card__meta">
            <span class="badge badge--${e.type}">${typeLabel}</span>
            <span class="text-muted text-sm">${rel}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <section class="mt-8">
      <h3 class="section-title mb-4">Nejbližší <span class="accent">události</span></h3>
      <div class="event-strip">${cards}</div>
    </section>
  `;
}

function renderCourseGrid(courses) {
  if (courses.length === 0) {
    return `
      <section class="mt-8">
        <h3 class="section-title mb-4">Moje <span class="accent">předměty</span></h3>
        <div class="empty-state">
          <p>Zatím nemáš žádné předměty.</p>
          <a href="#/course/new" class="btn btn--primary mt-4">Přidat předmět</a>
        </div>
      </section>
    `;
  }

  const cards = courses.map(c => {
    const creditColor = getCreditColor(c.credits);
    const nextEvent = getNextEvent(c);
    const componentsBar = renderComponentsBar(c.components || []);

    return `
      <div class="course-card" data-course-id="${c.id}">
        <div class="course-card__bar" style="background-color: ${creditColor}"></div>
        <div class="course-card__content">
          <div class="course-card__header">
            <div>
              <span class="course-card__code mono">${c.code}</span>
              <h4 class="course-card__name">${c.name}</h4>
            </div>
            <span class="badge badge--credit" style="background-color: ${creditColor}">${c.credits}</span>
          </div>
          <p class="course-card__lecturer text-muted text-sm">${c.lecturer || ''}</p>
          ${componentsBar}
          ${renderMiniProgress(c)}
          ${nextEvent}
        </div>
      </div>
    `;
  }).join('');

  return `
    <section class="mt-8">
      <h3 class="section-title mb-4">Moje <span class="accent">předměty</span></h3>
      <div class="course-grid">${cards}</div>
    </section>
  `;
}

function getCreditColor(credits) {
  const map = {
    3: 'var(--color-credit-3)', 4: 'var(--color-credit-4)', 5: 'var(--color-credit-5)',
    6: 'var(--color-credit-6)', 7: 'var(--color-credit-7)',
  };
  return map[credits] || 'var(--color-teal)';
}

function getNextEvent(course) {
  if (!course.events || course.events.length === 0) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const future = course.events
    .filter(e => new Date(e.date + 'T00:00:00') >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (future.length === 0) return '';
  const e = future[0];
  const rel = daysUntil(e.date);
  return `
    <div class="course-card__event text-sm">
      <span class="text-muted">Další:</span>
      <span>${e.title}</span>
      <span class="badge badge--${e.type}">${rel}</span>
    </div>
  `;
}

function renderMiniProgress(course) {
  const components = course.components || [];
  const progress = getProgress(course);
  const hasAnyProgress = progress.some(p => p.earned != null || p.completed);
  if (!hasAnyProgress || components.length === 0) return '';

  const allCompleted = progress.every(p => p.completed);
  if (allCompleted) {
    return '<div class="course-card__progress text-sm text-teal">Splněno &#10003;</div>';
  }

  // Calculate earned pct and remaining
  let earnedPct = 0;
  let remainingWeight = 0;
  const remaining = [];

  components.forEach((c, i) => {
    const p = progress[i] || { earned: null, completed: false };
    if (p.earned != null && c.maxScore) {
      earnedPct += (p.earned / c.maxScore) * c.weight;
    } else if (!p.completed) {
      remainingWeight += c.weight;
      remaining.push(c);
    }
  });

  const earnedRounded = Math.round(earnedPct);
  if (remainingWeight <= 0) return '';

  // Find best achievable grade
  const scale = course.gradingScale || [];
  const bestGrade = [...scale]
    .sort((a, b) => b.minPercent - a.minPercent)
    .find(g => {
      const needed = g.minPercent - earnedPct;
      return needed <= remainingWeight;
    });

  const examComp = remaining.find(c => c.type === 'exam') || remaining[0];
  const examName = examComp ? examComp.name.toLowerCase() : 'zbytku';

  let neededText = '';
  if (bestGrade && bestGrade.grade !== '4') {
    const neededPct = Math.round(((bestGrade.minPercent - earnedPct) / remainingWeight) * 100);
    const gradeSymbol = bestGrade.grade === '1' ? '\u2460' : bestGrade.grade === '2' ? '\u2461' : '\u2462';
    neededText = ` · ${neededPct}% z ${examName} na ${gradeSymbol}`;
  }

  return `<div class="course-card__progress text-sm text-muted">${earnedRounded}% zatím${neededText}</div>`;
}

function renderComponentsBar(components) {
  if (components.length === 0) return '';
  const segments = components.map(c => {
    const colors = {
      exam: 'var(--color-comp-exam)', test: 'var(--color-comp-test)', project: 'var(--color-comp-project)',
      homework: 'var(--color-comp-homework)', seminar: 'var(--color-comp-seminar)',
      attendance: 'var(--color-comp-attendance)', other: 'var(--color-comp-other)',
    };
    const color = colors[c.type] || colors.other;
    return `<div class="comp-bar__segment" style="width:${c.weight}%;background-color:${color}" title="${c.name} (${c.weight}%)"></div>`;
  }).join('');
  return `<div class="comp-bar">${segments}</div>`;
}
