/* ==========================================================================
   StudyHub — Course detail view
   ========================================================================== */

import { getCourse, getSemester } from '../store.js';
import { navigate } from '../router.js';
import { formatDateCZ, daysUntil, getTeachingWeek } from '../utils/dates.js';

const EVENT_TYPE_LABELS = {
  exam: 'Zkouška', test: 'Test', deadline: 'Deadline',
  presentation: 'Prezentace', other: 'Jiné',
};

const COMPONENT_TYPE_LABELS = {
  exam: 'Zkouška', test: 'Test', project: 'Projekt',
  homework: 'Domácí úlohy', seminar: 'Seminář', attendance: 'Docházka', other: 'Jiné',
};

const COMPONENT_COLORS = {
  exam: '#dc2626', test: '#d97706', project: '#009ee0',
  homework: '#7c3aed', seminar: '#00957d', attendance: '#166534', other: '#5a7060',
};

const GRADE_COLORS = {
  '1': '#166534', '2': '#00957d', '3': '#d97706', '4': '#dc2626',
};

const SCHEDULE_TYPE_LABELS = {
  lecture: 'Přednáška', seminar: 'Cvičení', lab: 'Laboratoř', other: 'Jiné',
};

/**
 * Render course detail view.
 * @param {HTMLElement} container
 * @param {string} courseId
 */
export function renderCourseDetail(container, courseId) {
  const course = getCourse(courseId);

  if (!course) {
    container.innerHTML = `
      <div class="alert alert--error mt-6">Předmět nebyl nalezen.</div>
      <a href="#/" class="btn btn--outline mt-4">← Zpět na přehled</a>
    `;
    return;
  }

  const creditColor = getCreditColor(course.credits);

  container.innerHTML = `
    <div class="detail">
      <div class="detail__actions">
        <button class="btn btn--outline" id="btn-back">← Zpět</button>
        <button class="btn btn--primary" id="btn-edit">Upravit</button>
      </div>

      <div class="detail__header">
        <div>
          <span class="detail__code mono">${course.code}</span>
          <h1 class="detail__name">${course.name}</h1>
          <p class="detail__meta text-muted">
            ${course.lecturer || ''}
            ${course.insisUrl ? ` · <a href="${course.insisUrl}" target="_blank" class="text-teal">InSIS</a>` : ''}
          </p>
        </div>
        <span class="badge badge--credit badge--credit-lg" style="background-color:${creditColor}">${course.credits}</span>
      </div>

      ${renderDescription(course)}

      <div class="detail__grid">
        <div class="detail__left">
          ${renderComponents(course.components)}
          ${renderRequirements(course.requirements)}
          ${renderGradingScale(course.gradingScale)}
          ${renderWorkload(course.workload)}
          ${renderLiterature(course.literature)}
          ${course.notes ? renderNotes(course.notes) : ''}
        </div>
        <div class="detail__right">
          ${renderWeeklyTopics(course.weeklyTopics)}
          ${renderSchedule(course.schedule)}
          ${renderTimeline(course.events)}
        </div>
      </div>
    </div>
  `;

  container.querySelector('#btn-back').addEventListener('click', () => {
    navigate('#/');
  });
  container.querySelector('#btn-edit').addEventListener('click', () => {
    navigate(`#/course/${courseId}/edit`);
  });
}

function getCreditColor(credits) {
  const map = { 3: '#009ee0', 4: '#7c3aed', 5: '#d97706', 6: '#00957d', 7: '#dc2626' };
  return map[credits] || '#00957d';
}

// ── Description & AI summary ─────────────────────────────────────────────────

function renderDescription(course) {
  const desc = course.description || '';
  const ai = course.aiSummary || '';
  const outcomes = course.learningOutcomes || [];

  if (!desc && !ai && outcomes.length === 0) return '';

  return `
    <section class="detail__section detail__description-section">
      ${ai ? `<div class="detail__ai-summary card mb-4"><p class="text-sm">${ai}</p><span class="tag text-sm">AI shrnutí</span></div>` : ''}
      ${desc ? `<p class="text-sm mb-4">${desc}</p>` : ''}
      ${outcomes.length > 0 ? `
        <div class="detail__outcomes">
          <h4 class="text-sm" style="font-weight:var(--weight-semibold);margin-bottom:var(--space-2)">Výsledky učení</h4>
          <ul class="detail__outcomes-list">
            ${outcomes.map(o => `<li class="text-sm">${o}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    </section>
  `;
}

// ── Components ───────────────────────────────────────────────────────────────

function renderComponents(components) {
  if (!components || components.length === 0) {
    return '<p class="text-muted text-sm">Žádné složky hodnocení.</p>';
  }

  const cards = components.map(c => {
    const color = COMPONENT_COLORS[c.type] || COMPONENT_COLORS.other;
    const typeLabel = COMPONENT_TYPE_LABELS[c.type] || c.type;
    const passing = c.passingScore != null ? `<span class="text-sm text-muted">Min. ${c.passingScore} b.</span>` : '';
    const maxPts = c.maxScore != null ? `<span class="text-sm text-muted">Max. ${c.maxScore} b.</span>` : '';

    return `
      <div class="comp-card">
        <div class="comp-card__indicator" style="background-color:${color}"></div>
        <div class="comp-card__body">
          <div class="comp-card__header">
            <span class="comp-card__name">${c.name}</span>
            <span class="comp-card__weight">${c.weight} %</span>
          </div>
          <span class="tag text-sm">${typeLabel}</span>
          <div class="comp-card__points">${maxPts} ${passing}</div>
          ${c.description ? `<p class="comp-card__desc text-sm text-muted">${c.description}</p>` : ''}
        </div>
        <div class="comp-card__bar">
          <div class="comp-card__bar-fill" style="width:${c.weight}%;background-color:${color}"></div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <section class="detail__section">
      <h3 class="section-title mb-4">Složky <span class="accent">hodnocení</span></h3>
      ${cards}
    </section>
  `;
}

// ── Requirements ─────────────────────────────────────────────────────────────

function renderRequirements(requirements) {
  if (!requirements || requirements.length === 0) return '';

  const items = requirements.map(r => `
    <li class="req-item">
      <span class="req-item__check">○</span>
      <span>${r}</span>
    </li>
  `).join('');

  return `
    <section class="detail__section">
      <h3 class="section-title mb-4">Podmínky <span class="accent">splnění</span></h3>
      <ul class="req-list">${items}</ul>
    </section>
  `;
}

// ── Grading scale ────────────────────────────────────────────────────────────

function renderGradingScale(scale) {
  if (!scale || scale.length === 0) return '';

  const cells = scale.map(g => {
    const color = GRADE_COLORS[g.grade] || '#5a7060';
    return `
      <div class="grade-cell" style="--grade-color:${color}">
        <span class="grade-cell__grade">${g.grade}</span>
        ${g.label ? `<span class="grade-cell__label">${g.label}</span>` : ''}
        <span class="grade-cell__pct">${g.minPercent} %+</span>
      </div>
    `;
  }).join('');

  return `
    <section class="detail__section">
      <h3 class="section-title mb-4">Klasifikační <span class="accent">stupnice</span></h3>
      <div class="grade-grid">${cells}</div>
    </section>
  `;
}

// ── Workload ─────────────────────────────────────────────────────────────────

function renderWorkload(workload) {
  if (!workload || !workload.total) return '';

  const items = [
    { label: 'Přednášky', value: workload.lectures, color: '#00957d' },
    { label: 'Cvičení', value: workload.seminars, color: '#009ee0' },
    { label: 'Projekt', value: workload.project, color: '#7c3aed' },
    { label: 'Příprava na testy', value: workload.testPrep, color: '#d97706' },
    { label: 'Příprava na zkoušku', value: workload.examPrep, color: '#dc2626' },
  ].filter(i => i.value > 0);

  const bars = items.map(i => {
    const pct = Math.round((i.value / workload.total) * 100);
    return `
      <div class="workload-bar">
        <div class="workload-bar__label">
          <span class="text-sm">${i.label}</span>
          <span class="text-sm mono">${i.value} h</span>
        </div>
        <div class="workload-bar__track">
          <div class="workload-bar__fill" style="width:${pct}%;background-color:${i.color}"></div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <section class="detail__section">
      <h3 class="section-title mb-4">Studijní <span class="accent">zátěž</span></h3>
      ${bars}
      <p class="text-sm text-muted mt-2">Celkem: <strong>${workload.total} h</strong></p>
    </section>
  `;
}

// ── Literature ───────────────────────────────────────────────────────────────

function renderLiterature(literature) {
  if (!literature) return '';
  const req = literature.required || [];
  const rec = literature.recommended || [];
  if (req.length === 0 && rec.length === 0) return '';

  const renderList = (items, label) => {
    if (items.length === 0) return '';
    return `
      <div class="mb-3">
        <h4 class="text-sm" style="font-weight:var(--weight-semibold);margin-bottom:var(--space-1)">${label}</h4>
        <ul class="detail__lit-list">
          ${items.map(i => `<li class="text-sm">${i}</li>`).join('')}
        </ul>
      </div>
    `;
  };

  return `
    <section class="detail__section">
      <h3 class="section-title mb-4"><span class="accent">Literatura</span></h3>
      ${renderList(req, 'Povinná')}
      ${renderList(rec, 'Doporučená')}
    </section>
  `;
}

// ── Weekly topics ────────────────────────────────────────────────────────────

function renderWeeklyTopics(topics) {
  if (!topics || topics.length === 0) return '';

  const semester = getSemester();
  const currentWeek = semester ? getTeachingWeek(semester) : null;
  // Extract week number from string like "4. týden"
  const currentWeekNum = currentWeek && typeof currentWeek === 'string'
    ? parseInt(currentWeek)
    : (typeof currentWeek === 'number' ? currentWeek : null);

  const rows = topics.map(t => {
    const isCurrent = currentWeekNum === t.week;
    return `
      <div class="weekly-topic ${isCurrent ? 'weekly-topic--current' : ''}">
        <span class="weekly-topic__week mono">${t.week}.</span>
        <span class="text-sm">${t.topic}</span>
        ${isCurrent ? '<span class="badge badge--ok text-sm">Teď</span>' : ''}
      </div>
    `;
  }).join('');

  return `
    <section class="detail__section">
      <h3 class="section-title mb-4">Obsah <span class="accent">po týdnech</span></h3>
      <div class="weekly-topics">${rows}</div>
    </section>
  `;
}

// ── Schedule ─────────────────────────────────────────────────────────────────

function renderSchedule(schedule) {
  if (!schedule || schedule.length === 0) return '';

  const rows = schedule.map(s => {
    const typeLabel = SCHEDULE_TYPE_LABELS[s.type] || s.type;
    return `
      <tr>
        <td class="mono">${s.day}</td>
        <td class="mono">${s.time}</td>
        <td>${s.room || '—'}</td>
        <td><span class="tag text-sm">${typeLabel}</span></td>
        <td class="text-sm">${s.teacher || '—'}</td>
        <td class="text-sm text-muted">${s.capacity ? `${s.capacity} míst` : ''}</td>
      </tr>
    `;
  }).join('');

  return `
    <section class="detail__section">
      <h3 class="section-title mb-4"><span class="accent">Rozvrh</span></h3>
      <div class="detail__schedule-wrap">
        <table class="detail__schedule">
          <thead>
            <tr><th>Den</th><th>Čas</th><th>Místnost</th><th>Typ</th><th>Vyučující</th><th></th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
}

// ── Notes ────────────────────────────────────────────────────────────────────

function renderNotes(notes) {
  return `
    <section class="detail__section">
      <h3 class="section-title mb-4"><span class="accent">Poznámky</span></h3>
      <div class="card"><p class="text-sm">${notes}</p></div>
    </section>
  `;
}

// ── Timeline ─────────────────────────────────────────────────────────────────

function renderTimeline(events) {
  if (!events || events.length === 0) {
    return `
      <section class="detail__section">
        <h3 class="section-title mb-4"><span class="accent">Termíny</span></h3>
        <p class="text-muted text-sm">Žádné termíny.</p>
      </section>
    `;
  }

  const sorted = [...events].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const items = sorted.map(e => {
    const color = COMPONENT_COLORS[e.type] || COMPONENT_COLORS.other;
    const typeLabel = EVENT_TYPE_LABELS[e.type] || e.type;
    const rel = daysUntil(e.date);
    const isPast = rel === 'proběhlo';
    const dateFmt = formatDateCZ(e.date);

    return `
      <div class="timeline-item ${isPast ? 'timeline-item--past' : ''}">
        <div class="timeline-item__dot" style="background-color:${color}"></div>
        <div class="timeline-item__content">
          <div class="timeline-item__header">
            <span class="timeline-item__title">${e.title}</span>
            <span class="badge badge--${e.type}">${typeLabel}</span>
          </div>
          <p class="timeline-item__date text-sm">${dateFmt}${e.time ? `, ${e.time}` : ''}</p>
          ${e.location ? `<p class="text-sm text-muted">${e.location}</p>` : ''}
          <div class="timeline-item__badges">
            <span class="badge ${isPast ? '' : 'badge--rel'}">${rel}</span>
            ${e.registered ? '<span class="badge badge--ok">Zapsáno</span>' : ''}
          </div>
          ${e.notes ? `<p class="text-sm text-muted mt-1">${e.notes}</p>` : ''}
        </div>
      </div>
    `;
  }).join('');

  return `
    <section class="detail__section">
      <h3 class="section-title mb-4"><span class="accent">Termíny</span></h3>
      <div class="timeline">${items}</div>
    </section>
  `;
}
