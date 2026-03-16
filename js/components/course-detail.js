/* ==========================================================================
   StudyHub — Course detail view
   ========================================================================== */

import { getCourse } from '../store.js';
import { navigate } from '../router.js';
import { formatDateCZ, daysUntil } from '../utils/dates.js';

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
  A: '#166534', B: '#00957d', C: '#009ee0', D: '#d97706', E: '#d97706', F: '#dc2626',
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

      <div class="detail__grid">
        <div class="detail__left">
          ${renderComponents(course.components)}
          ${renderRequirements(course.requirements)}
          ${renderGradingScale(course.gradingScale)}
          ${course.notes ? renderNotes(course.notes) : ''}
        </div>
        <div class="detail__right">
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

function renderGradingScale(scale) {
  if (!scale || scale.length === 0) return '';

  const cells = scale.map(g => {
    const color = GRADE_COLORS[g.grade] || '#5a7060';
    return `
      <div class="grade-cell" style="--grade-color:${color}">
        <span class="grade-cell__grade">${g.grade}</span>
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

function renderNotes(notes) {
  return `
    <section class="detail__section">
      <h3 class="section-title mb-4"><span class="accent">Poznámky</span></h3>
      <div class="card"><p class="text-sm">${notes}</p></div>
    </section>
  `;
}

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
