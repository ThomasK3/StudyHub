/* ==========================================================================
   StudyHub — Calendar view (month grid + list)
   ========================================================================== */

import { getCourses, getCoursesForSemester, getSemester, getAllEvents, getActiveSemesterLabel } from '../store.js';
import { navigate } from '../router.js';
import {
  CZ_MONTHS_NOM, DAY_NAMES, getWeeksInMonth,
  formatDateCZ, daysUntil, toISO,
} from '../utils/dates.js';

const EVENT_TYPE_LABELS = {
  exam: 'Zkouška', test: 'Test', deadline: 'Deadline',
  presentation: 'Prezentace', other: 'Jiné',
};

const EVENT_TYPE_COLORS = {
  exam: 'var(--color-red)', test: 'var(--color-amber)',
  deadline: 'var(--color-blue)', presentation: 'var(--color-purple)',
  other: 'var(--color-muted)',
};

// ── State ────────────────────────────────────────────────────────────────────

let viewMode = 'month';   // 'month' | 'list'
let viewYear, viewMonth;  // for month view
let filterType = 'all';
let filterCourses = new Set(); // courseIds — empty = show all

function initState() {
  const today = new Date();
  viewYear = today.getFullYear();
  viewMonth = today.getMonth();
}

// ── Main render ──────────────────────────────────────────────────────────────

/**
 * @param {HTMLElement} container
 */
export function renderCalendar(container) {
  if (viewYear == null) initState();

  const semester = getSemester();
  const allEvents = getAllEvents(); // already filtered by active semester in store
  const activeSemLabel = getActiveSemesterLabel();
  const courses = activeSemLabel ? getCoursesForSemester(activeSemLabel) : getCourses();

  container.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'calendar';
  container.appendChild(wrapper);

  wrapper.innerHTML = `
    <div class="cal-toolbar">
      <div class="cal-toolbar__left">
        ${viewMode === 'month' ? `
          <button class="btn btn--outline btn--sm" id="cal-prev">←</button>
          <h3 class="cal-toolbar__title">${CZ_MONTHS_NOM[viewMonth]} ${viewYear}</h3>
          <button class="btn btn--outline btn--sm" id="cal-next">→</button>
          <button class="btn btn--outline btn--sm" id="cal-today">Dnes</button>
        ` : `
          <h3 class="cal-toolbar__title">Seznam událostí</h3>
        `}
      </div>
      <div class="cal-toolbar__right">
        <button class="btn btn--sm ${viewMode === 'month' ? 'btn--primary' : 'btn--outline'}" id="cal-mode-month">Měsíc</button>
        <button class="btn btn--sm ${viewMode === 'list' ? 'btn--primary' : 'btn--outline'}" id="cal-mode-list">Seznam</button>
      </div>
    </div>

    <div id="cal-content">
      ${viewMode === 'month'
        ? renderMonthGrid(allEvents, semester)
        : renderListView(allEvents, courses)}
    </div>
  `;

  bindToolbar(wrapper, container, allEvents, courses, semester);
  bindEventClicks(wrapper);
}

// ── Schedule chip helpers ────────────────────────────────────────────────────

const DAY_ABBR_TO_JS = { 'Ne': 0, 'Po': 1, 'Út': 2, 'St': 3, 'Čt': 4, 'Pá': 5, 'So': 6 };

const CREDIT_COLORS = {
  3: '#7c9ab5', 4: '#6d8f77', 5: '#9b7d5e', 6: '#00957d', 7: '#6b5ea8',
};

function getScheduleChipsByDate(courses, semester) {
  const result = {}; // isoDate → [{label, color, courseId}]
  const holidaySet = new Set((semester?.holidays || []).map(h => h.date));

  for (const course of courses) {
    if (!Array.isArray(course.schedule) || !Array.isArray(course.selectedSchedule)) continue;
    const color = CREDIT_COLORS[course.credits] || '#00957d';

    for (const idx of course.selectedSchedule) {
      const s = course.schedule[idx];
      if (!s || !s.day) continue;
      const jsDay = DAY_ABBR_TO_JS[s.day];
      if (jsDay == null) continue;

      // Find all matching dates in the viewed month
      const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(viewYear, viewMonth, d);
        if (date.getDay() !== jsDay) continue;
        const iso = toISO(date);
        if (holidaySet.has(iso)) continue;
        (result[iso] || (result[iso] = [])).push({
          label: `${s.time ? s.time.split('-')[0] : ''} ${course.code}`.trim(),
          color,
          courseId: course.id,
        });
      }
    }
  }
  return result;
}

// ── Month grid ───────────────────────────────────────────────────────────────

function renderMonthGrid(allEvents, semester) {
  const weeks = getWeeksInMonth(viewYear, viewMonth, semester);
  const courses = getCourses();

  // Build event lookup by ISO date
  const eventsByDate = {};
  for (const ev of allEvents) {
    if (!ev.date) continue;
    (eventsByDate[ev.date] || (eventsByDate[ev.date] = [])).push(ev);
  }

  // Build schedule chips lookup
  const schedByDate = getScheduleChipsByDate(courses, semester);

  // Header row
  const header = `
    <div class="cal-grid__header">
      <div class="cal-grid__wk-header">Tý.</div>
      ${DAY_NAMES.map(d => `<div class="cal-grid__day-header">${d}</div>`).join('')}
    </div>
  `;

  const rows = weeks.map(week => {
    const dayCells = week.days.map(day => {
      const evts = eventsByDate[day.isoDate] || [];
      const schedChips = (schedByDate[day.isoDate] || []).map(sc =>
        `<div class="cal-chip cal-chip--sched" style="--chip-color:${sc.color}" data-course-id="${sc.courseId}" title="${sc.label}">${sc.label}</div>`
      ).join('');

      const eventCount = evts.length;
      const chips = evts.slice(0, 2).map(e => {
        const color = EVENT_TYPE_COLORS[e.type] || EVENT_TYPE_COLORS.other;
        return `<div class="cal-chip" style="--chip-color:${color}" data-course-id="${e.courseId}" title="${e.title} (${e.courseCode})">${e.title}</div>`;
      }).join('');
      const more = eventCount > 2 ? `<span class="cal-more">+${eventCount - 2}</span>` : '';

      const classes = [
        'cal-grid__cell',
        day.inMonth ? '' : 'cal-grid__cell--outside',
        day.isToday ? 'cal-grid__cell--today' : '',
      ].filter(Boolean).join(' ');

      return `
        <div class="${classes}">
          <span class="cal-grid__num">${day.dayOfMonth}</span>
          ${schedChips}${chips}${more}
        </div>
      `;
    }).join('');

    return `
      <div class="cal-grid__row">
        <div class="cal-grid__wk">${week.weekLabel}</div>
        ${dayCells}
      </div>
    `;
  }).join('');

  return `<div class="cal-grid">${header}${rows}</div>`;
}

// ── List view ────────────────────────────────────────────────────────────────

function renderListView(allEvents, courses) {
  // Filters
  const typeFilters = [
    { value: 'all', label: 'Vše' },
    { value: 'test', label: 'Testy' },
    { value: 'exam', label: 'Zkoušky' },
    { value: 'deadline', label: 'Deadliny' },
  ];

  const filterBar = `
    <div class="cal-filters">
      <div class="cal-filters__types">
        ${typeFilters.map(f =>
          `<button class="btn btn--sm ${filterType === f.value ? 'btn--primary' : 'btn--outline'}" data-filter-type="${f.value}">${f.label}</button>`
        ).join('')}
      </div>
      <div class="cal-filters__courses">
        ${courses.map(c => {
          const active = filterCourses.size === 0 || filterCourses.has(c.id);
          return `<button class="btn btn--sm ${active ? 'btn--primary' : 'btn--outline'}" data-filter-course="${c.id}">
            <span class="mono">${c.code}</span>
          </button>`;
        }).join('')}
      </div>
    </div>
  `;

  // Filter events
  let filtered = allEvents;
  if (filterType !== 'all') {
    filtered = filtered.filter(e => e.type === filterType);
  }
  if (filterCourses.size > 0) {
    filtered = filtered.filter(e => filterCourses.has(e.courseId));
  }

  if (filtered.length === 0) {
    return filterBar + `<p class="text-muted mt-6">Žádné události odpovídající filtrům.</p>`;
  }

  // Group by date
  const grouped = {};
  for (const e of filtered) {
    const key = e.date || 'unknown';
    (grouped[key] || (grouped[key] = [])).push(e);
  }

  const dates = Object.keys(grouped).sort();
  const sections = dates.map(date => {
    const events = grouped[date];
    const items = events.map(e => {
      const color = EVENT_TYPE_COLORS[e.type] || EVENT_TYPE_COLORS.other;
      const typeLabel = EVENT_TYPE_LABELS[e.type] || e.type;
      const rel = daysUntil(e.date);
      return `
        <div class="cal-list-item" data-course-id="${e.courseId}">
          <div class="cal-list-item__bar" style="background-color:${color}"></div>
          <div class="cal-list-item__body">
            <div class="cal-list-item__header">
              <span class="cal-list-item__title">${e.title}</span>
              <span class="badge badge--${e.type}">${typeLabel}</span>
            </div>
            <div class="cal-list-item__meta text-sm text-muted">
              <span class="mono text-teal">${e.courseCode}</span>
              ${e.time ? `<span>${e.time}</span>` : ''}
              ${e.location ? `<span>${e.location}</span>` : ''}
              <span>${rel}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="cal-list-group">
        <div class="cal-list-date">${formatDateCZ(date)}</div>
        ${items}
      </div>
    `;
  }).join('');

  return filterBar + `<div class="cal-list">${sections}</div>`;
}

// ── Event binding ────────────────────────────────────────────────────────────

function bindToolbar(wrapper, container, allEvents, courses, semester) {
  // Month navigation
  wrapper.querySelector('#cal-prev')?.addEventListener('click', () => {
    viewMonth--;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    renderCalendar(container);
  });

  wrapper.querySelector('#cal-next')?.addEventListener('click', () => {
    viewMonth++;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    renderCalendar(container);
  });

  wrapper.querySelector('#cal-today')?.addEventListener('click', () => {
    const today = new Date();
    viewYear = today.getFullYear();
    viewMonth = today.getMonth();
    renderCalendar(container);
  });

  // Mode switch
  wrapper.querySelector('#cal-mode-month')?.addEventListener('click', () => {
    viewMode = 'month';
    renderCalendar(container);
  });

  wrapper.querySelector('#cal-mode-list')?.addEventListener('click', () => {
    viewMode = 'list';
    renderCalendar(container);
  });

  // List filters — type
  wrapper.querySelectorAll('[data-filter-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      filterType = btn.dataset.filterType;
      renderCalendar(container);
    });
  });

  // List filters — course toggle
  wrapper.querySelectorAll('[data-filter-course]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.filterCourse;
      if (filterCourses.has(id)) {
        filterCourses.delete(id);
      } else {
        filterCourses.add(id);
      }
      // If all are selected, clear set (= show all)
      if (filterCourses.size === courses.length) {
        filterCourses.clear();
      }
      renderCalendar(container);
    });
  });
}

function bindEventClicks(wrapper) {
  wrapper.querySelectorAll('[data-course-id]').forEach(el => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => {
      navigate(`#/course/${el.dataset.courseId}`);
    });
  });
}
