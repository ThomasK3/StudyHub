/* ==========================================================================
   StudyHub — Course detail view
   ========================================================================== */

import { getCourse, getSemester, updateProgress, getProgress, updateScheduleSelection } from '../store.js';
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
  exam: 'var(--color-comp-exam)', test: 'var(--color-comp-test)', project: 'var(--color-comp-project)',
  homework: 'var(--color-comp-homework)', seminar: 'var(--color-comp-seminar)',
  attendance: 'var(--color-comp-attendance)', other: 'var(--color-comp-other)',
};

const GRADE_COLORS = {
  '1': 'var(--color-grade-1)', '2': 'var(--color-grade-2)',
  '3': 'var(--color-grade-3)', '4': 'var(--color-grade-4)',
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
          <div id="detail-components">${renderComponents(course)}</div>
          <div id="detail-calculator">${renderCalculator(course)}</div>
          ${renderRequirements(course.requirements)}
          ${renderGradingScale(course.gradingScale)}
          ${renderWorkload(course.workload)}
          ${renderLiterature(course.literature)}
          ${course.notes ? renderNotes(course.notes) : ''}
        </div>
        <div class="detail__right">
          ${renderWeeklyTopics(course.weeklyTopics)}
          <div id="detail-schedule">${renderSchedule(course)}</div>
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

  bindProgress(container, courseId);
}

function getCreditColor(credits) {
  const map = {
    3: 'var(--color-credit-3)', 4: 'var(--color-credit-4)', 5: 'var(--color-credit-5)',
    6: 'var(--color-credit-6)', 7: 'var(--color-credit-7)',
  };
  return map[credits] || 'var(--color-teal)';
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

// ── Components with progress ────────────────────────────────────────────────

function renderComponents(course) {
  const components = course.components;
  if (!components || components.length === 0) {
    return '<p class="text-muted text-sm">Žádné složky hodnocení.</p>';
  }

  const progress = getProgress(course);

  const cards = components.map((c, i) => {
    const color = COMPONENT_COLORS[c.type] || COMPONENT_COLORS.other;
    const typeLabel = COMPONENT_TYPE_LABELS[c.type] || c.type;
    const p = progress[i] || { earned: null, completed: false };

    // Status indicator
    let statusHtml = '';
    if (p.earned != null && c.passingScore != null) {
      if (p.earned >= c.passingScore) {
        statusHtml = '<span class="comp-card__status comp-card__status--pass">&#10003;</span>';
      } else {
        statusHtml = '<span class="comp-card__status comp-card__status--fail">&#10007;</span>';
      }
    } else if (p.completed) {
      statusHtml = '<span class="comp-card__status comp-card__status--pass">&#10003;</span>';
    }

    // Score display
    let scoreHtml = '';
    if (p.earned != null && c.maxScore) {
      const pct = Math.round((p.earned / c.maxScore) * 100);
      const scoreClass = c.passingScore != null
        ? (p.earned >= c.passingScore ? 'comp-card__score--pass' : 'comp-card__score--fail')
        : '';
      scoreHtml = `<span class="comp-card__score mono ${scoreClass}">${p.earned}/${c.maxScore} b (${pct}%)</span>`;
    }

    const passing = c.passingScore != null ? `<span class="text-sm text-muted">Min. ${c.passingScore} b.</span>` : '';
    const maxPts = c.maxScore != null ? `<span class="text-sm text-muted">Max. ${c.maxScore} b.</span>` : '';
    const completedClass = p.completed ? 'comp-card--completed' : '';

    return `
      <div class="comp-card ${completedClass}">
        <div class="comp-card__indicator" style="background-color:${color}"></div>
        <div class="comp-card__body">
          <div class="comp-card__header">
            <span class="comp-card__name">${c.name}</span>
            <div class="comp-card__header-right">
              ${statusHtml}
              <span class="comp-card__weight">${c.weight} %</span>
            </div>
          </div>
          <span class="tag text-sm">${typeLabel}</span>
          <div class="comp-card__points">${maxPts} ${passing}</div>
          ${c.description ? `<p class="comp-card__desc text-sm text-muted">${c.description}</p>` : ''}
          <div class="comp-card__progress" data-comp-idx="${i}">
            ${c.maxScore ? `
              <label class="comp-card__earned-label text-sm">
                Získané body:
                <input type="number" class="input input--sm progress-earned" data-idx="${i}"
                  min="0" max="${c.maxScore}" step="0.5"
                  value="${p.earned != null ? p.earned : ''}"
                  placeholder="—">
              </label>
            ` : ''}
            <label class="comp-card__check-label text-sm">
              <input type="checkbox" class="progress-completed" data-idx="${i}" ${p.completed ? 'checked' : ''}>
              Splněno
            </label>
            ${scoreHtml}
          </div>
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

function bindProgress(container, courseId) {
  const refreshAll = () => {
    const course = getCourse(courseId);
    if (!course) return;
    const compEl = container.querySelector('#detail-components');
    if (compEl) compEl.innerHTML = renderComponents(course);
    const calcEl = container.querySelector('#detail-calculator');
    if (calcEl) calcEl.innerHTML = renderCalculator(course);
    const schedEl = container.querySelector('#detail-schedule');
    if (schedEl) schedEl.innerHTML = renderSchedule(course);
    // Re-bind after re-render
    bindProgressEvents(container, courseId, refreshAll);
  };

  bindProgressEvents(container, courseId, refreshAll);
}

function bindProgressEvents(container, courseId, refreshAll) {
  container.querySelectorAll('.progress-completed').forEach(cb => {
    cb.addEventListener('change', () => {
      const idx = parseInt(cb.dataset.idx, 10);
      updateProgress(courseId, idx, { completed: cb.checked });
      refreshAll();
    });
  });

  container.querySelectorAll('.progress-earned').forEach(input => {
    input.addEventListener('change', () => {
      const idx = parseInt(input.dataset.idx, 10);
      const val = input.value.trim();
      const earned = val === '' ? null : parseFloat(val);
      const completed = earned != null ? true : undefined;
      const update = { earned };
      if (completed) update.completed = true;
      updateProgress(courseId, idx, update);
      refreshAll();
    });
  });

  container.querySelectorAll('.schedule-row').forEach(row => {
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => {
      const course = getCourse(courseId);
      if (!course) return;
      const idx = parseInt(row.dataset.schedIdx, 10);
      const selected = new Set(course.selectedSchedule || []);
      if (selected.has(idx)) {
        selected.delete(idx);
      } else {
        selected.add(idx);
      }
      updateScheduleSelection(courseId, [...selected]);
      refreshAll();
    });
  });
}

// ── Calculator ──────────────────────────────────────────────────────────────

function renderCalculator(course) {
  const components = course.components || [];
  const progress = getProgress(course);
  const scale = course.gradingScale || [];

  // Check if any progress entered
  const hasAnyProgress = progress.some(p => p.earned != null || p.completed);
  if (!hasAnyProgress || components.length === 0 || scale.length === 0) return '';

  // Calculate earned percentage so far
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
    // completed but no earned score → counts as 0 earned for that weight
  });

  const earnedRounded = Math.round(earnedPct * 10) / 10;

  // Sort grades by minPercent descending (best first)
  const sortedGrades = [...scale]
    .filter(g => g.grade !== '4')
    .sort((a, b) => b.minPercent - a.minPercent);

  // Check for guaranteed grade
  let guaranteedGrade = null;
  for (const g of [...scale].sort((a, b) => b.minPercent - a.minPercent)) {
    if (earnedPct >= g.minPercent) {
      guaranteedGrade = g;
      break;
    }
  }

  const rows = sortedGrades.map(g => {
    const color = GRADE_COLORS[g.grade] || 'var(--color-muted)';
    const label = g.label || '';
    const neededTotal = g.minPercent - earnedPct;
    const isGuaranteed = earnedPct >= g.minPercent;

    if (isGuaranteed) {
      return `
        <div class="calc-row calc-row--guaranteed">
          <div class="calc-row__grade" style="color:${color}">${g.grade}</div>
          <div class="calc-row__info">
            <span class="text-sm"><strong>Máš jistou ${label.toLowerCase()}!</strong></span>
          </div>
        </div>
      `;
    }

    if (remainingWeight <= 0) {
      return `
        <div class="calc-row calc-row--impossible">
          <div class="calc-row__grade" style="color:${color}">${g.grade}</div>
          <div class="calc-row__info">
            <span class="text-sm text-muted">Na ${label.toLowerCase()} už to nestačí.</span>
          </div>
        </div>
      `;
    }

    const neededPctOfRemaining = Math.round((neededTotal / remainingWeight) * 100);

    if (neededPctOfRemaining > 100) {
      return `
        <div class="calc-row calc-row--impossible">
          <div class="calc-row__grade" style="color:${color}">${g.grade}</div>
          <div class="calc-row__info">
            <span class="text-sm text-muted">Na ${label.toLowerCase()} už to bohužel nestačí.</span>
          </div>
        </div>
      `;
    }

    // Build detail text for each remaining component
    const details = remaining.map(c => {
      const neededPts = c.maxScore ? Math.ceil((neededPctOfRemaining / 100) * c.maxScore) : null;
      const ptsText = neededPts != null ? ` (${neededPts} b. z ${c.maxScore})` : '';
      return `${neededPctOfRemaining}% z ${c.name}${ptsText}`;
    }).join(', ');

    return `
      <div class="calc-row">
        <div class="calc-row__grade" style="color:${color}">${g.grade}</div>
        <div class="calc-row__info">
          <span class="text-sm">Potřebuješ <strong>${neededPctOfRemaining}%</strong> ze zbývajících složek</span>
          <span class="text-xs text-muted">${details}</span>
          <div class="calc-row__bar">
            <div class="calc-row__bar-fill" style="width:${Math.min(neededPctOfRemaining, 100)}%;background-color:${color}"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <section class="detail__section">
      <h3 class="section-title mb-4">Kolik <span class="accent">potřebuji?</span></h3>
      <div class="card calc-card">
        <div class="calc-summary mb-3">
          <span class="text-sm">Aktuální stav: <strong class="text-teal">${earnedRounded}%</strong></span>
          ${remainingWeight > 0 ? `<span class="text-sm text-muted">Zbývá: ${remainingWeight}% váhy</span>` : ''}
        </div>
        <div class="calc-rows">${rows}</div>
      </div>
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
    const color = GRADE_COLORS[g.grade] || 'var(--color-muted)';
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
    { label: 'Přednášky', value: workload.lectures, color: 'var(--color-workload-lectures)' },
    { label: 'Cvičení', value: workload.seminars, color: 'var(--color-workload-seminars)' },
    { label: 'Projekt', value: workload.project, color: 'var(--color-workload-project)' },
    { label: 'Příprava na testy', value: workload.testPrep, color: 'var(--color-workload-testprep)' },
    { label: 'Příprava na zkoušku', value: workload.examPrep, color: 'var(--color-workload-examprep)' },
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

function renderSchedule(course) {
  const schedule = course.schedule;
  if (!schedule || schedule.length === 0) return '';

  const selected = new Set(course.selectedSchedule || []);

  const rows = schedule.map((s, i) => {
    const typeLabel = SCHEDULE_TYPE_LABELS[s.type] || s.type;
    const isSelected = selected.has(i);
    return `
      <tr class="schedule-row ${isSelected ? 'schedule-row--selected' : ''}" data-sched-idx="${i}" style="${!isSelected ? 'opacity:0.5' : ''}">
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
      <p class="text-sm text-muted mb-2">Klikni na hodiny, které navštěvuješ</p>
      <div class="detail__schedule-wrap">
        <table class="detail__schedule detail__schedule--interactive">
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
