// ============================================================
// INSIS FIS VŠE — Catalog Scraper
// Spustit v browser console na stránce s rozvrhem FIS
// (kde je tabulka #tmtab_1 s výpisem všech předmětů)
// ============================================================

const TEST_LIMIT = 3;    // null = scrapeuj vše, číslo = jen N předmětů pro test
const DELAY_MS   = 400;  // pauza mezi HTTP requesty (ms)
const SEMESTER_SHORT = 'LS 2025/26';   // do outer sloupce
const SEMESTER_FULL  = 'LS 2025/26';   // do data.semester

// ── Mapovací tabulky ──
const DAY_MAP  = { 'Pondělí':'Po','Úterý':'Út','Středa':'St','Čtvrtek':'Čt','Pátek':'Pá','Sobota':'So','Neděle':'Ne' };
const TYPE_MAP = { 'Přednáška':'lecture','Cvičení':'seminar','Seminář':'seminar' };

// ============================================================
// 1. Extrahuj předměty + rozvrh z tabulky na stránce
// ============================================================
function extractFromSchedule() {
  const rows    = document.querySelectorAll('#tmtab_1 tbody tr');
  const courses = new Map();

  rows.forEach(row => {
    const cells = row.querySelectorAll('td.odsazena');
    if (cells.length < 9) return;

    const norm   = s => s.replace(/\xa0/g, ' ').trim();
    const code   = norm(cells[0].textContent);
    const anchor = cells[1].querySelector('a');
    if (!anchor) return;

    const name    = norm(anchor.textContent);
    const href    = anchor.getAttribute('href');
    const idMatch = href.match(/predmet=(\d+)/);
    if (!idMatch) return;
    const predmetId = idMatch[1];

    const splitCell = td => td.innerHTML
      .split(/<br\s*\/?>/i)
      .map(s => norm(s.replace(/<[^>]+>/g, '')))
      .filter(Boolean);

    const types    = splitCell(cells[2]);
    const days     = splitCell(cells[3]);
    const times    = splitCell(cells[4]);
    const rooms    = splitCell(cells[5]);
    const teachers = Array.from(cells[7].querySelectorAll('a')).map(a => norm(a.textContent));
    const cap      = parseInt(cells[9]?.textContent) || null;

    if (!courses.has(predmetId)) {
      courses.set(predmetId, {
        code,
        name,
        predmetId,
        schedule: [],
        teachersSet: new Set(),
      });
    }

    const c = courses.get(predmetId);
    teachers.forEach(t => c.teachersSet.add(t));

    const len = Math.max(types.length, days.length, 1);
    for (let i = 0; i < len; i++) {
      c.schedule.push({
        type:      types[i] || types[0] || '',
        day:       days[i]  || days[0]  || '',
        time:      times[i] || times[0] || '',
        room:      rooms[i] || rooms[0] || '',
        teachers,
        capacity:  cap,
        frequency: 'každý',
      });
    }
  });

  for (const c of courses.values()) {
    c.teachers = Array.from(c.teachersSet);
    delete c.teachersSet;
  }

  return Array.from(courses.values());
}

// ============================================================
// 2. Parsuj detail sylabu z HTML
// ============================================================
function parseSyllabus(htmlText) {
  const parser = new DOMParser();
  const doc    = parser.parseFromString(htmlText, 'text/html');
  const norm   = s => (s || '').replace(/\xa0/g, ' ').trim();

  const result = {
    credits:          null,
    completionType:   null,
    language:         null,
    semester:         null,
    description:      null,
    learningOutcomes: null,
    workload:         {},
    components:       [],
    gradingScale:     [],
    literature:       { required: [], recommended: [] },
    allLecturers:     [],
  };

  // Label → Value řádky (s tučným popiskem)
  doc.querySelectorAll('table tr').forEach(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length < 2) return;
    const b = cells[0].querySelector('b span');
    if (!b) return;
    const label = norm(b.textContent).replace(/:$/, '');
    const val   = norm(cells[1].textContent);

    if (label.includes('ECTS')) {
      const m = val.match(/^(\d+)/);
      if (m) result.credits = parseInt(m[1]);
    }
    if (label.includes('ukončení'))  result.completionType = val;
    if (label.includes('Jazyk'))     result.language = val;
    if (label.includes('Semestr'))   result.semester = val;
    if (label.includes('Vyučující')) {
      result.allLecturers = Array.from(cells[1].querySelectorAll('a')).map(a => {
        const sib = a.nextSibling?.textContent?.replace(/\s+/g, ' ').trim() || '';
        return norm(a.textContent) + (sib ? ' ' + sib : '');
      });
    }
  });

  // Textové bloky (colspan=2)
  doc.querySelectorAll('table tr').forEach(row => {
    const title = row.querySelector('td b span.nowrap');
    const body  = row.querySelector('td[colspan="2"]');
    if (!title || !body) return;
    const label = norm(title.textContent).replace(/:$/, '');
    const val   = norm(body.textContent);
    if (label.includes('Zaměření'))  result.description      = val;
    if (label.includes('Výsledky'))  result.learningOutcomes = val;
  });

  // Studijní zátěž — tabulka s "Prezenční studium" ale BEZ "Den"/"Čas"
  doc.querySelectorAll('table').forEach(tbl => {
    const heads = Array.from(tbl.querySelectorAll('thead td, thead th')).map(h => norm(h.textContent));
    if (!heads.some(h => h.includes('Prezenční'))) return;
    if (heads.some(h => h.includes('Den') || h.includes('Čas'))) return;

    tbl.querySelectorAll('tbody tr').forEach(row => {
      const cells = Array.from(row.querySelectorAll('td')).map(td => norm(td.textContent));
      if (cells.length < 2) return;
      const label = cells.slice(0, cells.length - 1).join(' ').trim();
      const hours = parseInt(cells[cells.length - 1].match(/(\d+)/)?.[1]);
      if (label && hours) result.workload[label] = hours;
    });
  });

  // Components — tabulka s procenty hodnocení
  doc.querySelectorAll('table').forEach(tbl => {
    const heads = Array.from(tbl.querySelectorAll('thead td, thead th')).map(h => norm(h.textContent));
    if (!heads.some(h => h.includes('Prezenční'))) return;

    let hasPercent = false;
    tbl.querySelectorAll('tbody td').forEach(td => {
      if (norm(td.textContent).includes('%')) hasPercent = true;
    });
    if (!hasPercent) return;

    tbl.querySelectorAll('tbody tr').forEach(row => {
      const cells = Array.from(row.querySelectorAll('td')).map(td => norm(td.textContent));
      if (cells.length < 2) return;
      const name   = cells[0];
      const weight = parseInt(cells[cells.length - 1].replace('%', ''));
      if (!name || name.includes('Celkem') || isNaN(weight)) return;

      const nl = name.toLowerCase();
      result.components.push({
        name,
        type: nl.includes('zkouš')    ? 'exam'
            : nl.includes('test')     ? 'test'
            : nl.includes('práce') || nl.includes('semestr') ? 'project'
            : nl.includes('aktiv') || nl.includes('účast')   ? 'attendance'
            : 'other',
        weight,
        maxScore:    null,
        description: '',
        passingScore: null,
      });
    });
  });

  // GradingScale (tabulka 1=Výborně, 2=Velmi dobře...)
  const gradeLabels = { '1':'Výborně','2':'Velmi dobře','3':'Dobře','4':'Nedostatečně' };
  const gradeMin    = { '1':90,'2':75,'3':60,'4':0 };
  doc.querySelectorAll('table').forEach(tbl => {
    const firstVals = Array.from(tbl.querySelectorAll('tbody tr'))
      .slice(0, 2).map(r => norm(r.querySelector('td')?.textContent || ''));
    if (!firstVals.includes('1') && !firstVals.includes('2')) return;

    tbl.querySelectorAll('tbody tr').forEach(row => {
      const cells = Array.from(row.querySelectorAll('td')).map(td => norm(td.textContent));
      const grade = cells[0];
      if (!gradeLabels[grade]) return;
      result.gradingScale.push({ grade, label: gradeLabels[grade], minPercent: gradeMin[grade] });
    });
  });

  // Literatura
  let mode = null;
  doc.querySelectorAll('table tbody tr').forEach(row => {
    const text = norm(row.textContent);
    if (text === 'Základní:')   { mode = 'req'; return; }
    if (text === 'Doporučená:') { mode = 'rec'; return; }
    if (!mode) return;
    row.querySelectorAll('td table tbody tr td').forEach(cell => {
      const t = norm(cell.textContent);
      if (t.length > 15 && t !== 'Základní:' && t !== 'Doporučená:') {
        if (mode === 'req') result.literature.required.push(t.slice(0, 400));
        if (mode === 'rec') result.literature.recommended.push(t.slice(0, 400));
      }
    });
  });

  return result;
}

// ============================================================
// 3. Generuj SQL pro Supabase
// ============================================================
function generateSQL(courses) {
  const escape = s => (s || '').replace(/'/g, "''");

  const findH = (wl, ...keys) => {
    for (const [label, val] of Object.entries(wl)) {
      const l = label.toLowerCase();
      if (keys.some(k => l.includes(k))) return val || 0;
    }
    return 0;
  };

  return courses.filter(c => !c.error).map(c => {
    const det = c.detail || {};

    const schedule = c.schedule.map(s => ({
      day:       DAY_MAP[s.day]   || s.day,
      room:      s.room,
      time:      s.time,
      type:      TYPE_MAP[s.type] || s.type,
      teacher:   s.teachers?.[0] || '',
      capacity:  s.capacity,
      frequency: 'každý',
    }));

    const wl = det.workload || {};
    const workload = {
      total:    Object.values(wl).reduce((a, b) => a + (b || 0), 0),
      lectures: findH(wl, 'přednášk'),
      seminars: findH(wl, 'cvičen', 'seminář'),
      project:  findH(wl, 'semestrální', 'projekt'),
      examPrep: findH(wl, 'závěrečn', 'ústní'),
      testPrep: findH(wl, 'průběžn', 'test'),
    };

    const data = {
      code:             c.code,
      name:             c.name,
      group:            'povinny',
      credits:          det.credits || 0,
      insisUrl:         `https://insis.vse.cz/auth/katalog/syllabus.pl?predmet=${c.predmetId};lang=cz`,
      lecturer:         det.allLecturers?.[0]?.split('(')[0]?.trim() || c.teachers?.[0] || '',
      schedule,
      semester:         SEMESTER_FULL,
      workload,
      aiSummary:        '',
      components:       det.components || [],
      literature:       det.literature || { required: [], recommended: [] },
      description:      det.description || '',
      allLecturers:     det.allLecturers || c.teachers || [],
      gradingScale:     det.gradingScale || [],
      requirements:     [],
      weeklyTopics:     [],
      learningOutcomes: det.learningOutcomes
        ? det.learningOutcomes.split('\n').map(s => s.trim()).filter(Boolean)
        : [],
    };

    return `INSERT INTO shared_courses (code, semester, data, status) VALUES (
  '${escape(c.code)}',
  '${escape(SEMESTER_SHORT)}',
  '${escape(JSON.stringify(data))}'::jsonb,
  'validated'
)
ON CONFLICT ON CONSTRAINT unique_code_semester
DO UPDATE SET data = EXCLUDED.data, status = 'validated';`;
  }).join('\n\n');
}

// ============================================================
// 4. Hlavní runner — spustí vše
// ============================================================
async function runScraper() {
  console.log('📚 Extrahuju předměty z rozvrhu...');
  let courses = extractFromSchedule();
  console.log(`Nalezeno ${courses.length} unikátních předmětů.`);

  if (TEST_LIMIT) {
    courses = courses.slice(0, TEST_LIMIT);
    console.log(`🧪 TEST_LIMIT=${TEST_LIMIT}, scrapeuju jen ${courses.length} předmětů.`);
  }

  for (let i = 0; i < courses.length; i++) {
    const c = courses[i];
    const url = `/auth/katalog/syllabus.pl?predmet=${c.predmetId};lang=cz`;
    console.log(`[${i+1}/${courses.length}] ${c.code} – ${c.name}`);
    try {
      const resp = await fetch(url);
      const html = await resp.text();
      c.detail = parseSyllabus(html);
    } catch (err) {
      console.error(`❌ Chyba u ${c.code}:`, err.message);
      c.error  = err.message;
      c.detail = {};
    }
    if (i < courses.length - 1) await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log('\n✅ Hotovo! JSON výsledek:');
  console.log(JSON.stringify(courses.map(c => ({
    code:    c.code,
    name:    c.name,
    credits: c.detail?.credits,
    components_count: c.detail?.components?.length,
    has_description:  !!c.detail?.description,
    schedule_count:   c.schedule.length,
  })), null, 2));

  const sql = generateSQL(courses);
  console.log('\n📄 SQL pro Supabase:\n');
  console.log(sql);

  return { courses, sql };
}

// ── Spustit! ──
runScraper();