# CLAUDE.md — Instrukce pro Claude Code

> Tento soubor obsahuje kontext a pravidla pro Claude Code při práci na projektu StudyHub.

## O projektu

StudyHub je semestrální dashboard pro studenty FIS VŠE v Praze. Umožňuje na jednom místě vidět podmínky předmětů, termíny testů a zkoušek, a plánovat zkouškové období.

Hlavní dokumentace: viz `README.md`

## Tech stack

**Vanilla HTML/CSS/JS.** Žádný framework, žádný bundler, žádný npm.

- `<script type="module">` pro organizaci kódu
- CSS Custom Properties pro theming
- localStorage pro persistence
- Fetch API pro AI volání (Gemini API)

## AI integrace

**Provider: Google Gemini API (free tier).** Ne Claude API — nemá free tier, pro studentský projekt neudržitelné.

Veškerá AI komunikace jde přes abstraktní vrstvu v `js/utils/ai.js`:
- Jedna funkce `callAI(systemPrompt, userPrompt)` → vrací string
- Konfigurace providera v `AI_CONFIG` objektu
- Výchozí model: `gemini-2.5-flash`
- Student si zadá vlastní API klíč (zdarma z ai.google.dev), uloží se do localStorage
- Bez klíče funguje vše kromě AI parsování a plánovače

Gemini API formát se liší od Claude:
```javascript
// Gemini endpoint
`${endpoint}/${model}:generateContent?key=${apiKey}`

// Gemini request body
{
  contents: [{ parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }],
  generationConfig: { temperature: 0.2, maxOutputTokens: 4000 }
}

// Gemini response
data.candidates[0].content.parts[0].text
```

Pokud bude potřeba vyměnit za jiného providera (Claude, OpenAI), změní se jen `ai.js`.

## Design

Vizuální identita FIS VŠE:
- Primární barva: `#00957d` (teal)
- Fonty: Barlow Condensed (nadpisy, uppercase), Barlow (body), JetBrains Mono (kódy)
- Detailní tokeny: viz `css/variables.css`
- Referenční design book: `docs/fis-design-book.html`

## Pravidla pro kód

1. **Žádné závislosti na npm** — vše vanilla, max CDN link (Google Fonts)
2. **ES Modules** — každý soubor je modul s `export`/`import`
3. **Angličtina v kódu** — proměnné, funkce, komentáře anglicky
4. **Čeština v UI** — veškerý text viditelný uživateli česky
5. **JSDoc** — veřejné funkce dokumentovat
6. **BEM-lite CSS** — `.component`, `.component__element`, `.component--modifier`
7. **Mobile-first** — responsive od 320px

## Struktura souborů

```
index.html              # Vstupní bod
css/
  variables.css         # Design tokeny
  base.css              # Reset, typografie
  components.css        # Sdílené UI komponenty
  [view].css            # CSS pro konkrétní view
js/
  app.js                # Entry point, inicializace
  store.js              # Data management, localStorage
  router.js             # Hash-based routing
  components/           # View moduly
  data/                 # Statická data (katalogy)
  utils/                # Pomocné funkce
```

## Datový model

Viz `README.md` sekce 5. Klíčové entity:
- **Course** — předmět se složkami hodnocení, termíny, podmínkami
- **Semester** — definice semestru s daty začátku/konce výuky

## Kritické funkce

### Týdny výuky
- Číslo aktuálního týdne musí být viditelné na dashboardu i v kalendáři
- Výpočet: `floor((today - semesterStart) / 7) + 1`, korekce o prázdniny
- Před semestrem: "Přípravný týden", po výuce: "Zkouškové období"

### Formulář předmětu
- Select předmětu z katalogu FIS (`data/fis-courses.json`) — filtrovat podle kódu i názvu
- Dynamické seznamy pro složky hodnocení a termíny (přidávat/odebírat řádky)
- Validace: součet vah hodnocení by měl být 100%

### Persistence
- Klíče: `studyhub_courses`, `studyhub_semester`, `studyhub_settings`
- Ukládat po každé změně
- Export/import jako JSON soubor

## Příkazy

```bash
# Lokální vývoj
python -m http.server 8000
# nebo
npx serve .

# Žádný build step — soubory se servírují přímo
```

## Časté chyby, kterým se vyhnout

- Nepoužívat React, Vue, ani jiný framework
- Nepoužívat `require()` — jen ES Module `import`
- Nepoužívat purple gradienty nebo Inter font (viz FIS design)
- Nepřeskakovat validaci formuláře
- AI funkce jsou vždy volitelné — formulář musí fungovat i bez nich
- AI volání jen přes `callAI()` z `utils/ai.js` — nikdy přímo fetch na API endpoint
- Nepoužívat Claude API — používáme Gemini (free tier), viz sekce AI integrace výše
