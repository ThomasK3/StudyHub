# VŠE StudyHub

Semestrální dashboard pro studenty FIS VŠE v Praze. Na jednom místě vidíš podmínky předmětů, složky hodnocení, termíny testů a zkoušek, kalendář a AI plánovač zkouškového období. Stačí na začátku semestru zadat (nebo AI importovat) informace o předmětech a celý semestr máš přehled.

## Demo

<!-- Po deploy na GitHub Pages doplnit odkaz -->
> **[Živá ukázka →](https://thomask3.github.io/StudyHub/)**

## Funkce

- **Dashboard** — přehled předmětů, kreditů, aktuální týden výuky, nejbližší události
- **Detail předmětu** — složky hodnocení, podmínky, klasifikace, rozvrh, obsah po týdnech, literatura
- **Formulář** — přidání/editace předmětu s katalogovým vyhledáváním FIS předmětů
- **AI import sylabu** — vlož text z InSIS, AI (Gemini) vyplní celý formulář
- **Kalendář** — měsíční mřížka s čísly týdnů + seznamový pohled s filtry
- **Plánovač zkouškového** — AI navrhne optimální plán zkoušek
- **Sdílená databáze** — Supabase pro předvyplněné předměty od komunity (volitelné)
- **Offline-first** — vše funguje lokálně, data v localStorage

## Spuštění lokálně

```bash
# Klonování
git clone https://github.com/tomaskanuch/StudyHub.git
cd StudyHub

# Spuštění (žádný build step)
python3 -m http.server 8000
# nebo
npx serve .
```

Otevři `http://localhost:8000` v prohlížeči.

## Gemini API klíč

AI funkce (import sylabu, plánovač) vyžadují Google Gemini API klíč (zdarma):

1. Jdi na [ai.google.dev](https://ai.google.dev/) a vytvoř API klíč
2. V aplikaci klikni na libovolnou AI funkci — zobrazí se dialog pro zadání klíče
3. Klíč se uloží do localStorage (nikdy se neodesílá jinam než na Google API)

Bez klíče funguje vše kromě AI parsování a plánovače.

## Supabase (volitelné)

Pro sdílenou databázi předvyplněných předmětů:

1. Vytvoř Supabase projekt na [supabase.com](https://supabase.com/)
2. Spusť SQL z `supabase/schema.sql` v SQL Editoru
3. Uprav `js/utils/supabase.js` — doplň URL a anon key svého projektu

Bez Supabase aplikace funguje normálně v offline režimu.

## Technologie

| | |
|---|---|
| **Frontend** | Vanilla HTML/CSS/JS, ES Modules |
| **Styly** | CSS Custom Properties, BEM-lite, mobile-first |
| **Data** | localStorage (offline-first) |
| **AI** | Google Gemini API (free tier, `gemini-2.5-flash`) |
| **Sdílení** | Supabase (volitelné, free tier) |
| **Deploy** | GitHub Pages (statické soubory, žádný build) |

## Struktura

```
index.html              # Vstupní bod
css/                    # Stylesheets (variables, base, components, views)
js/
  app.js                # Entry point, routing
  store.js              # localStorage persistence
  router.js             # Hash-based routing
  components/           # View moduly (dashboard, detail, form, calendar, planner)
  utils/                # AI, dates, Supabase
  data/                 # Katalog FIS předmětů
docs/                   # Projektová dokumentace, design book
supabase/               # SQL schema pro Supabase
```

## Dokumentace

Podrobná projektová dokumentace je v [`docs/README-docs.md`](docs/README-docs.md).

## Licence

MIT
