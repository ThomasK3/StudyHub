# VŠE StudyHub — Projektová dokumentace

> Semestrální dashboard pro studenty FIS VŠE. Přehled předmětů, podmínek splnění, termínů a plánování zkouškového na jednom místě.

---

## 1. Motivace a cíl projektu

Student FIS VŠE má v semestru typicky 5–8 předmětů. Každý předmět má jiné podmínky splnění, jiné složky hodnocení, jiné termíny testů a zkoušek. Tyto informace jsou rozptýlené mezi:

- **InSIS** — oficiální sylabus (často obecný, neúplný)
- **Prezentace vyučujících** — úvodní přednášky s detailními podmínkami (odlišné od InSIS)
- **E-maily a MS Teams** — aktualizace, změny termínů

StudyHub řeší tento problém tím, že student si na začátku semestru (typicky jedno odpoledne) zadá informace o všech předmětech do jedné aplikace a pak celý semestr vidí:

- Co musí splnit a z čeho se to skládá
- Kdy má jaké testy, deadliny a zkoušky
- V jakém je týdnu výuky
- Optimální plán na zkouškové období (AI)


## 2. Vztah k existujícím nástrojům

### 4plan (4plan.vse.cz)
- **Co dělá:** Plánování studijního plánu napříč semestry — přiřazování předmětů do semestrů, kontrola prerekvizit, sledování kreditů
- **Tech stack:** Vanilla JS, Bootstrap Icons, Sortable.js, html2canvas. Statický frontend, data v JSON.
- **Rozdíl od StudyHub:** 4plan řeší *co budu studovat za celé studium*. StudyHub řeší *jak zvládnu tento konkrétní semestr* — jaké jsou podmínky, kdy jsou termíny, jak naplánovat zkouškové.

### InSIS
- Oficiální informační systém VŠE
- Obsahuje sylabus předmětů, ale v praxi ho vyučující nepravidelně aktualizují
- Skutečné podmínky bývají v úvodních prezentacích vyučujících

StudyHub je **doplněk**, ne náhrada. Čerpá data z InSIS (kódy, názvy, kredity) ale přidává studentem zadané detaily z prezentací vyučujících.


## 3. Architektura a tech stack

### Rozhodnutí: Vanilla JS (ne React)

Důvody:
- **Jednoduchost hostingu** — statické soubory, žádný build step pro produkci
- **Přiměřenost rozsahu** — aplikace má ~5 views, nepotřebuje virtual DOM
- **Konzistence s ekosystémem** — 4plan je taky vanilla JS
- **Nízká bariéra pro přispěvatele** — studenti FIS znají HTML/CSS/JS
- **Rychlost vývoje** — žádná konfigurace bundleru, přímé nasazení

### Struktura projektu

```
vse-studyhub/
├── index.html                  # Hlavní vstupní bod
├── css/
│   ├── variables.css           # CSS proměnné, FIS design tokens
│   ├── base.css                # Reset, typografie, základní layout
│   ├── components.css          # Karty, tlačítka, badge, alerty
│   ├── dashboard.css           # Přehled předmětů
│   ├── course-detail.css       # Detail předmětu
│   ├── calendar.css            # Kalendář
│   ├── form.css                # Formulář pro zadávání dat
│   └── planner.css             # AI plánovač
├── js/
│   ├── app.js                  # Hlavní entry point, routing, inicializace
│   ├── store.js                # Datový model, localStorage persistence
│   ├── router.js               # Jednoduchý hash-based router
│   ├── components/
│   │   ├── dashboard.js        # Přehled + statistiky
│   │   ├── course-detail.js    # Detail předmětu
│   │   ├── course-form.js      # Formulář zadávání/editace předmětu
│   │   ├── calendar.js         # Kalendář s týdny výuky
│   │   ├── planner.js          # AI plánovač zkouškového
│   │   └── navbar.js           # Navigace
│   ├── data/
│   │   ├── fis-courses.json    # Katalog předmětů FIS (kódy, názvy, kredity, skupiny)
│   │   └── semesters.json      # Definice semestrů (začátky, konce, prázdniny)
│   └── utils/
│       ├── dates.js            # Práce s daty, výpočet týdnů
│       ├── ai.js               # Claude API volání
│       └── export.js           # Export/import dat
├── data/
│   └── fis-courses-2025.json   # Statický katalog FIS předmětů
├── docs/
│   ├── ARCHITECTURE.md         # Tento dokument
│   └── DATA-MODEL.md           # Detailní popis datového modelu
└── README.md                   # GitHub README
```

### Klíčové technologie

| Technologie | Účel |
|---|---|
| Vanilla HTML/CSS/JS | Základní stack, žádný framework |
| ES Modules | `<script type="module">` pro organizaci kódu |
| localStorage | Persistance dat v prohlížeči |
| CSS Custom Properties | FIS design tokeny, theming |
| Fetch API | Volání AI API (Gemini) pro AI funkce |
| Google Gemini API | AI parsování sylabů, plánovač (free tier) |
| Supabase | Sdílená databáze předvyplněných předmětů (free tier) |
| Google Fonts | Barlow, Barlow Condensed, JetBrains Mono |

### Hosting

Statické soubory — vhodné pro:
- GitHub Pages
- VŠE server (pokud bude zájem)
- Netlify / Vercel (zero-config)
- Lokálně přes `python -m http.server`


## 4. Design systém

Založen na **FIS VŠE vizuální identitě** (viz přiložený design book).

### Barvy

| Token | Hodnota | Použití |
|---|---|---|
| `--teal` | `#00957d` | Primární barva, CTA tlačítka, akcentní prvky |
| `--teal-dark` | `#007a68` | Hover stavy |
| `--teal-deep` | `#003d35` | Footer, tmavé pozadí |
| `--blue` | `#009ee0` | Sekundární akcent, informační alerty |
| `--navy` | `#1a2d3a` | Kódové bloky |
| `--dark-nav` | `#1e2e28` | Top utility bar |
| `--white` | `#ffffff` | Karty, pozadí |
| `--off-white` | `#f4f7f6` | Pozadí stránky |
| `--muted` | `#5a7060` | Sekundární text |
| `--text` | `#1a1a1a` | Primární text |
| `--border` | `#dde8e5` | Okraje, oddělovače |
| `--red` | `#dc2626` | Chyby, zkouškové termíny, grade F |
| `--amber` | `#d97706` | Varování, testy |

### Typografie

| Použití | Font | Styl |
|---|---|---|
| Nadpisy (h1, h2, h3) | Barlow Condensed | 700–800, uppercase, tight tracking |
| Body text | Barlow | 400–600 |
| Kódy předmětů, čísla | JetBrains Mono | 400–600 |

### Komponenty

- **Karty předmětů** — bílý box, border `--border`, top color bar (barva kreditu), kulatý kreditový badge
- **Tlačítka** — ostrý border-radius (3px), filled primary (teal), outline secondary
- **Alert bary** — left border accent (zelená=ok, červená=chyba, modrá=info, žlutá=varování)
- **Datové boxy** — teal pozadí, bílý text, den + měsíc (u událostí)
- **Badge** — malé zakulacené štítky s pozadím a textem


## 5. Datový model

### Course (Předmět)

```javascript
{
  id: string,              // Unikátní ID (uuid nebo timestamp)
  code: string,            // Kód předmětu z InSIS, např. "3MG216"
  name: string,            // Název předmětu
  credits: number,         // Počet kreditů
  semester: string,        // Semestr, např. "LS 2025/26"
  group: string,           // "povinny" | "volitelny" | "jazyk" | "telocvik"
  lecturer: string,        // Přednášející (hlavní)
  allLecturers: string[],  // Všichni vyučující (přednášející, cvičící, zkoušející)
  
  // Obsah předmětu (z InSIS sylabu)
  description: string,     // Zaměření předmětu (z InSIS)
  aiSummary: string,       // AI-generovaný krátký popis pro studenty (2-3 věty)
  learningOutcomes: string[], // Výsledky učení
  weeklyTopics: [          // Obsah po týdnech (1-13)
    {
      week: number,        // Číslo týdne (1-13)
      topic: string        // Téma, např. "Marketingové mikroprostředí a makroprostředí"
    }
  ],
  
  // Studijní zátěž (hodiny)
  workload: {
    lectures: number,      // Účast na přednáškách
    seminars: number,      // Účast na cvičeních
    project: number,       // Semestrální práce
    testPrep: number,      // Příprava na testy
    examPrep: number,      // Příprava na zkoušku
    total: number          // Celkem
  },
  
  // Složky hodnocení
  components: [
    {
      name: string,        // Název, např. "Semestrální práce"
      weight: number,      // Procento z celkového hodnocení
      type: string,        // "exam" | "test" | "project" | "homework" | "seminar" | "attendance" | "other"
      description: string, // Detailní popis
      maxScore: number,    // Maximální počet bodů (volitelné)
      passingScore: number // Minimální počet bodů pro splnění (volitelné)
    }
  ],
  
  // Termíny a události
  events: [
    {
      id: string,
      title: string,       // Název, např. "Midterm test"
      date: string,        // ISO datum "2026-04-15"
      time: string,        // Čas "10:00" (volitelné)
      type: string,        // "test" | "exam" | "deadline" | "presentation" | "other"
      location: string,    // Místnost (volitelné)
      notes: string,       // Poznámky (volitelné)
      registered: boolean  // Zda se student zapsal na termín
    }
  ],
  
  // Rozvrhové akce (z InSIS)
  schedule: [
    {
      day: string,         // "Pondělí" | "Úterý" | ... | "Pátek"
      time: string,        // "14:30-16:00"
      room: string,        // "Vencovského aula"
      type: string,        // "Přednáška" | "Cvičení"
      teacher: string,     // Vyučující dané akce
      frequency: string,   // "Každý týden" | "Sudý týden" | "Lichý týden"
      capacity: number     // Kapacita
    }
  ],
  
  // Podmínky splnění
  requirements: string[],  // Seznam textových podmínek
  
  // Klasifikační stupnice
  gradingScale: [
    { grade: "1", label: "Výborně", minPercent: 90 },
    { grade: "2", label: "Velmi dobře", minPercent: 75 },
    { grade: "3", label: "Dobře", minPercent: 60 },
    { grade: "4", label: "Nedostatečně", minPercent: 0 },
  ],
  
  literature: {
    required: string[],    // Povinná literatura
    recommended: string[]  // Doporučená literatura
  },
  
  notes: string,           // Volné poznámky studenta
  insisUrl: string,        // Odkaz na InSIS stránku předmětu
  lastUpdated: string,     // ISO datum poslední úpravy
  source: string,          // "local" | "shared" — odkud data pocházejí
  sharedId: string         // ID v Supabase (pokud sdílený)
}
```

### InSIS sylabus — referenční struktura

Sylabus v InSIS má konzistentní formát. AI parser i formulář jsou navrženy podle této struktury:

```
Kód předmětu:        → code
Název:               → name
ECTS kredity:        → credits
Forma ukončení:      → type (zkouška/zápočet)
Semestr:             → semester
Vyučující:           → lecturer, allLecturers[]
Zaměření předmětu:   → description
Výsledky učení:      → learningOutcomes[]
Obsah předmětu:      → weeklyTopics[] (1-13 týdnů)
Studijní zátěž:      → workload {}
Způsoby hodnocení:   → components[]
Hodnocení:           → gradingScale[]
Zvláštní podmínky:   → requirements[]
Literatura:          → literature { required, recommended }
Rozvrhové akce:      → schedule[]
```

### Semester

```javascript
{
  id: string,                // "ZS-2025" nebo "LS-2026"
  name: string,              // "Zimní semestr 2025/26"
  type: string,              // "winter" | "summer"
  teachingStart: string,     // Datum začátku výuky
  teachingEnd: string,       // Datum konce výuky
  examStart: string,         // Datum začátku zkouškového
  examEnd: string,           // Datum konce zkouškového
  holidays: [                // Prázdniny a svátky v průběhu semestru
    { date: string, name: string }
  ]
}
```

### Odvozená data (počítaná, neukládaná)

- **Číslo týdne výuky** — vypočteno z `semester.teachingStart` a aktuálního data
- **Dní do události** — vypočteno z `event.date`
- **Celkové kredity** — součet kreditů zapsaných předmětů


## 6. Funkce a views

### 6.1 Přehled (Dashboard)

**URL:** `#/`

Hlavní obrazovka po otevření.

- **Semestrální statistiky:** Počet předmětů, celkové kredity, aktuální týden výuky
- **Nejbližší události:** Horizontální scroll strip s kartami nadcházejících událostí (datum, název, předmět, typ)
- **Mřížka předmětů:** Karty s kódem, názvem, kredity, složkami hodnocení a nejbližší událostí
- **Klik na kartu:** Přechod na detail předmětu

### 6.2 Detail předmětu

**URL:** `#/course/:id`

Kompletní informace o jednom předmětu.

- **Hlavička:** Kód, název, kredity, vyučující, odkaz na InSIS
- **Složky hodnocení:** Rozbalovací karty s váhou, popisem, min. body
- **Podmínky splnění:** Check-list styl
- **Klasifikační stupnice:** Vizuální grid známek
- **Časová osa termínů:** Vertikální timeline s barevným rozlišením typů
- **Editace:** Tlačítko pro úpravu (přechod na formulář)

### 6.3 Formulář předmětu (zadávání/editace)

**URL:** `#/course/new` nebo `#/course/:id/edit`

Toto je klíčová část — student zde zadává data z prezentací vyučujících.

**Princip:** Kombinace formulářových polí a select listů. Kde to jde, nabízíme předdefinované hodnoty (seznam FIS předmětů, typy hodnocení), ale necháváme prostor pro custom vstup.

#### Sekce formuláře:

1. **Základní info**
   - Předmět: **Select z katalogu FIS předmětů** (filtrovat je možné podle kódu i názvu) → automaticky vyplní kód, název, kredity, skupinu
   - Semestr: Select (ZS/LS + rok)
   - Vyučující: Textové pole (volně)
   - Odkaz na InSIS: Auto-generovaný nebo vlastní

2. **Složky hodnocení** (dynamický seznam, přidávat/odebírat)
   - Název složky: Text (s našeptávačem typických názvů: "Průběžný test", "Závěrečná zkouška", "Semestrální práce", "Domácí úlohy", "Docházka", ...)
   - Typ: Select z enum (exam, test, project, homework, seminar, attendance, other)
   - Váha (%): Číslo — se sumou validací (upozornit pokud != 100%)
   - Max. bodů: Číslo (volitelné)
   - Min. bodů pro splnění: Číslo (volitelné)
   - Popis: Textarea

3. **Termíny a události** (dynamický seznam)
   - Název: Text
   - Typ: Select (test, exam, deadline, presentation, other)
   - Datum: Date picker
   - Čas: Time picker (volitelné)
   - Místo: Text (volitelné)
   - Poznámka: Text (volitelné)

4. **Podmínky splnění** (dynamický seznam textových řádků)
   - Každá podmínka je jeden řádek
   - Přidávat/odebírat

5. **Klasifikační stupnice**
   - Předdefinované šablony: "Standardní VŠE", "Bodová" — nebo vlastní
   - Grid: Známka + min. procent

6. **Poznámky**
   - Volný text

#### AI asistovaný import (volitelné)

Alternativa k ručnímu vyplňování:
- Textarea pro vložení textu sylabu / prezentace
- Tlačítko "Analyzovat AI" → Claude API zpracuje text a předvyplní formulář
- Student zkontroluje a upraví
- **Nikdy nepřeskočit revizi studentem** — AI jen navrhuje, student potvrzuje

### 6.4 Kalendář

**URL:** `#/calendar`

Dva režimy zobrazení:

#### Měsíční pohled
- Klasická kalendářní mřížka
- Události zobrazené jako barevné čipy (barva dle předmětu)
- **Čísla týdnů výuky** na levé straně (1. týden, 2. týden, ..., 13. týden, zkouškové)
- Dnešní den zvýrazněný
- Navigace mezi měsíci

#### Seznamový pohled
- Chronologický seznam všech událostí
- Seskupené podle dnů
- Filtrování podle typu (testy, zkoušky, deadliny)
- Filtrování podle předmětu

### 6.5 AI Plánovač zkouškového

**URL:** `#/planner`

- Přehled dostupných termínů zkoušek ze všech předmětů
- Textarea pro preference studenta (volný text)
- Tlačítko "Vygenerovat plán" → Claude API
- Výstup: Navržený plán s odůvodněním, tipy na přípravu, varování o konfliktech
- Možnost upravit a regenerovat


## 7. Týdny výuky

Důležitá feature pro studenty — vědět "jsem v 5. týdnu, průběžka je v 7. týdnu".

### Logika výpočtu

```
aktuálníTýden = floor((dnešníDatum - začátekVýuky) / 7) + 1
```

S korekcemi:
- Prázdniny/svátky se odečítají (celé týdny)
- Před začátkem výuky = "Přípravný týden" nebo "Před semestrem"
- Po konci výuky = "Zkouškové období"
- Číslo zobrazit v headeru: "4. týden výuky (LS 2025/26)"

### Harmonogram FIS (typicky)

- **Zimní semestr:** Září/Říjen – Prosinec (13 týdnů výuky), Leden–Únor (zkouškové)
- **Letní semestr:** Únor – Květen (13 týdnů výuky), Květen–Červen (zkouškové)

Data harmonogramu se načítají z `semesters.json` a aktualizují každý rok.


## 8. Katalog předmětů FIS

Pro select listy ve formuláři potřebujeme statický katalog FIS předmětů.

### Zdroj dat

- 4plan.vse.cz API / scrapovaná data (kódy, názvy, kredity, skupiny, semestr)
- Případně ruční export z InSIS

### Formát `fis-courses.json`

```json
[
  {
    "code": "4IT115",
    "name": "Softwarové inženýrství",
    "credits": 6,
    "group": "povinny",
    "availableSemesters": ["winter", "summer"],
    "recommendedSemester": 3,
    "insisUrl": "https://insis.vse.cz/katalog/syllabus.pl?predmet=..."
  },
  ...
]
```

### Aktualizace

- Jednou ročně (před začátkem akademického roku)
- Skript pro aktualizaci z InSIS/4plan
- Verzování: `fis-courses-2025.json`, `fis-courses-2026.json`


## 9. Persistence dat

### localStorage (lokální data studenta)

Osobní data studenta (jeho předměty, nastavení) zůstávají v localStorage:

```javascript
// Klíče
"studyhub_courses"    // JSON pole předmětů studenta
"studyhub_semester"   // Aktuální semestr
"studyhub_settings"   // Nastavení (apiKey, theme)
```

### Supabase (sdílená databáze předmětů)

Pro sdílení předvyplněných předmětů mezi studenty používáme Supabase (free tier: 500 MB, 50k řádků).

#### Tabulky

```sql
-- Katalog předmětů FIS (statický, spravovaný adminem)
fis_catalog (
  code TEXT PRIMARY KEY,       -- "3MG216"
  name TEXT,
  credits INT,
  group TEXT,                   -- "povinny" | "volitelny" | ...
  available_semesters TEXT[],
  recommended_semester INT
)

-- Sdílené předvyplněné předměty (semestrálně aktualizované)
shared_courses (
  id UUID PRIMARY KEY,
  code TEXT REFERENCES fis_catalog(code),
  semester TEXT,                -- "LS 2025/26"
  data JSONB,                  -- Kompletní Course objekt
  ai_summary TEXT,             -- AI-generovaný popis
  status TEXT DEFAULT 'pending', -- "pending" | "validated" | "rejected"
  submitted_by TEXT,           -- Anonymní hash
  validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
)
```

#### Flow

1. **Admin (ty):** Předpřipravíš povinné předměty FIS z InSIS sylabů → nahraje se do `shared_courses` se status `validated`
2. **Student:** Při přidávání předmětu vidí: "Tento předmět už má někdo předvyplněný" → klikne "Použít" → data se zkopírují do localStorage → může upravit
3. **Community (budoucnost):** Student vyplní předmět → klikne "Sdílet pro ostatní" → data se pošlou do Supabase jako `pending` → admin zvaliduje → status `validated`

#### Bezpečnost

- Supabase anon key (veřejný) v kódu — to je OK, Row Level Security řeší přístupy
- SELECT na `shared_courses` kde `status = 'validated'` — veřejné čtení
- INSERT do `shared_courses` — kdokoliv (vytvoří pending záznam)
- UPDATE/DELETE — jen admin (přes Supabase dashboard nebo service key)
- Žádná osobní data se nesdílejí — jen předměty

### Export / Import

- **Export:** Stáhnout JSON soubor se všemi lokálními daty
- **Import:** Nahrát JSON soubor (validace + merge/overwrite)
- Formát kompatibilní mezi verzemi (migrace)


## 10. AI integrace (Google Gemini API)

### Proč Gemini a ne Claude API

Claude API nemá free tier — veškeré volání se účtuje per token. Pro studentský projekt, který potenciálně použije více lidí, to není udržitelné. Google Gemini API nabízí free tier bez nutnosti kreditní karty:

| Model | RPM | Requesty/den | Cena |
|---|---|---|---|
| Gemini 2.5 Pro | 5 | 100 | Zdarma |
| Gemini 2.5 Flash | 10 | 250 | Zdarma |
| Gemini 2.5 Flash-Lite | 15 | 1 000 | Zdarma |

Pro StudyHub (parsování ~7 sylabů jednou za semestr + občasný plán) stačí i ten nejnižší tier.

### Abstraktní AI vrstva

Kód je navržený tak, aby byl AI provider vyměnitelný. Veškerá komunikace s AI probíhá přes jednu funkci v `js/utils/ai.js`:

```javascript
// js/utils/ai.js

const AI_CONFIG = {
  provider: 'gemini',           // 'gemini' | 'claude' | 'openai'
  model: 'gemini-2.5-flash',
  apiKey: null,                  // Student si zadá svůj klíč (Gemini = zdarma)
  endpoint: 'https://generativelanguage.googleapis.com/v1beta/models'
};

/**
 * Pošle prompt AI modelu a vrátí textovou odpověď.
 * Abstrahuje rozdíly mezi providery (formát requestu, parsování odpovědi).
 * @param {string} systemPrompt - Systémový prompt (kontext)
 * @param {string} userPrompt - Uživatelský vstup
 * @returns {Promise<string>} - Textová odpověď modelu
 */
export async function callAI(systemPrompt, userPrompt) { ... }
```

Výměna providera = změna `AI_CONFIG` a úprava jednoho souboru. Zbytek aplikace volá jen `callAI()`.

### API klíč

- Student si vygeneruje **vlastní Gemini API klíč** zdarma na ai.google.dev
- Klíč se uloží do `localStorage` (klíč `studyhub_settings.apiKey`)
- V UI: jednoduchý dialog "Zadej API klíč" při prvním použití AI funkce
- Bez klíče funguje vše kromě AI (formulář se vyplní ručně)

### Použití

1. **Parsování sylabů** — Student vloží text, AI extrahuje strukturovaná data a předvyplní formulář
2. **Plánovač zkouškového** — AI navrhne optimální plán na základě termínů a preferencí

### Technické detaily

- Výchozí model: `gemini-2.5-flash` (rychlý, free tier 250 req/den)
- Volání přes `fetch` přímo z browseru
- System prompty v češtině, specifické pro VŠE kontext
- Odpovědi vždy jako JSON pro snadný parsing
- Gemini API formát: `generateContent` endpoint s `contents` polem

### Omezení

- AI navrhuje, student reviduje a potvrzuje
- Žádná automatická akce bez potvrzení
- Fallback: Vždy funguje i bez AI (ruční vyplnění formuláře)
- Rate limity Gemini free: 10 RPM / 250 req/den (Flash) — pro náš use case dostatečné
- Pokud free tier nestačí (hodně studentů najednou), Gemini placený tier je $0.30/M tokenů (Flash)


## 12. Scope a fáze vývoje

### Fáze 1 — MVP (hotovo ✓)

- [x] Designový základ (FIS branding)
- [x] Vanilla JS scaffolding, router, store
- [x] Formulář pro zadávání předmětů (se select listem FIS předmětů)
- [x] Dashboard s kartami předmětů
- [x] Detail předmětu
- [x] Kalendář s týdny výuky
- [x] localStorage persistence
- [x] Export/import JSON

### Fáze 2 — AI funkce (hotovo ✓)

- [x] AI parsování sylabů (předvyplnění formuláře, Gemini API)
- [x] AI plánovač zkouškového
- [x] Dialog pro API klíč

### Fáze 3 — Rozšířený datový model (aktuální)

- [ ] Rozšíření formuláře o InSIS strukturu (obsah, zátěž, rozvrh, literatura)
- [ ] AI parsování plného InSIS sylabu (všechna nová pole)
- [ ] AI-generovaný krátký popis předmětu
- [ ] Obsah předmětu (13 týdnů) v detailu

### Fáze 4 — Sdílená databáze (Supabase)

- [ ] Supabase projekt, tabulky, RLS
- [ ] Napojení katalogu předmětů na Supabase (místo statického JSON)
- [ ] Předvyplněné předměty — admin nahraje validované záznamy
- [ ] Student: "Použít předvyplněný" v přidávání předmětu
- [ ] Deploy na GitHub Pages

### Fáze 5 — Community

- [ ] Student: "Sdílet pro ostatní" → pending záznam
- [ ] Admin validace přes Supabase dashboard
- [ ] Podpora dalších fakult
- [ ] PWA, dark mode, notifikace

### Mimo scope (záměrně neřešíme)

- Plánování studijního plánu napříč semestry (to dělá 4plan)
- Propojení s InSIS API (neexistuje veřejné)
- Známkování / sledování průběžných výsledků


## 12. Konvence pro vývoj

### Kód

- ES Modules (`import/export`)
- JSDoc komentáře pro veřejné funkce
- Čeština v UI, angličtina v kódu (názvy proměnných, funkce)
- Žádné buildstep závislosti — `<script type="module">` přímo

### CSS

- BEM-lite naming: `.course-card`, `.course-card__title`, `.course-card--active`
- CSS Custom Properties pro všechny barvy a spacing
- Mobile-first, responsive breakpointy:
  - `< 640px` — mobil (1 sloupec)
  - `640px–1024px` — tablet (2 sloupce)
  - `> 1024px` — desktop (3 sloupce)

### Git

- `main` — stabilní verze
- `dev` — vývoj
- Feature branches: `feature/calendar-weeks`, `feature/ai-parser`
- Commit messages v češtině (konvence: `feat:`, `fix:`, `docs:`, `style:`)

---

*Dokument vytvořen: 16. 3. 2026*
*Verze: 1.0*
*Autor: Student FIS VŠE + Claude AI*