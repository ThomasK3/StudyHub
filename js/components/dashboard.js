/* ==========================================================================
   StudyHub — Dashboard view
   ========================================================================== */

import { getCourses, getSemester, getAllEvents } from '../store.js';
import { getTeachingWeek, daysUntil, getDateParts } from '../utils/dates.js';
import { navigate } from '../router.js';
import { isSupabaseConfigured } from '../utils/supabase.js';

const EVENT_TYPE_LABELS = {
  exam: 'Zkouška',
  test: 'Test',
  deadline: 'Deadline',
  presentation: 'Prezentace',
  other: 'Jiné',
};

/**
 * Render the dashboard view.
 * @param {HTMLElement} container
 */
export function renderDashboard(container) {
  const courses = getCourses();
  const semester = getSemester();
  const allEvents = getAllEvents();

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
      ${renderStats(courses.length, totalCredits, weekLabel, semester)}
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
  const map = { 3: '#009ee0', 4: '#7c3aed', 5: '#d97706', 6: '#00957d', 7: '#dc2626' };
  return map[credits] || '#00957d';
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

function renderComponentsBar(components) {
  if (components.length === 0) return '';
  const segments = components.map(c => {
    const colors = {
      exam: '#dc2626', test: '#d97706', project: '#009ee0',
      homework: '#7c3aed', seminar: '#00957d', attendance: '#166534', other: '#5a7060',
    };
    const color = colors[c.type] || colors.other;
    return `<div class="comp-bar__segment" style="width:${c.weight}%;background-color:${color}" title="${c.name} (${c.weight}%)"></div>`;
  }).join('');
  return `<div class="comp-bar">${segments}</div>`;
}
