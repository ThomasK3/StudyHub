# User Flows — VŠE StudyHub

## Flow 1: Onboarding (začátek semestru)

Student si na začátku semestru sedne a zadá předměty. Typicky 1–2 hodiny jednou za semestr.

```
1. Otevře StudyHub
2. Nastaví aktuální semestr (LS 2025/26)
     → Select: ZS/LS + rok
     → Automaticky nastaví data začátku/konce výuky a zkouškového
3. Pro každý předmět:
   a. Klikne "Přidat předmět"
   b. Vybere předmět z katalogu FIS
      → Select s vyhledáváním (kód nebo název)
      → Automaticky vyplní: kód, název, kredity, skupinu
   c. Vyplní vyučujícího
   d. Přidá složky hodnocení
      → Klikne "+ Přidat složku"
      → Pro každou: název, typ (select), váha (%), popis, min. body
      → Validace: suma vah = 100%
   e. Přidá termíny
      → Klikne "+ Přidat termín"
      → Pro každý: název, typ (select), datum, čas, místo
   f. Přidá podmínky splnění
      → Klikne "+ Přidat podmínku"
      → Textové řádky
   g. Volitelně: klasifikační stupnice (výchozí šablona nebo vlastní)
   h. Volitelně: poznámky
   i. Uloží
4. Po zadání všech předmětů → dashboard je kompletní
```

### Alternativa: AI import

```
3. Pro každý předmět:
   a. Klikne "Přidat předmět"
   b. Zvolí záložku "Import z textu"
   c. Vloží text sylabu / prezentace
   d. Klikne "Analyzovat"
   e. AI předvyplní formulář
   f. Student zkontroluje, opraví, doplní
   g. Uloží
```


## Flow 2: Průběžné použití (během semestru)

Student se vrací na StudyHub několikrát týdně.

```
1. Otevře StudyHub
2. Vidí dashboard:
   - "6. týden výuky (LS 2025/26)"
   - Nejbližší události (za 3 dny midterm z Statistiky)
   - Karty předmětů
3. Klikne na předmět → detail
   - Zkontroluje podmínky
   - Podívá se na timeline termínů
4. Přepne na kalendář
   - Vidí měsíční pohled s čísly týdnů
   - Zkontroluje co ho čeká
```


## Flow 3: Plánování zkouškového

Konec výuky, student plánuje termíny zkoušek.

```
1. Otevře AI Plánovač
2. Vidí přehled všech předmětů a dostupných termínů zkoušek
3. Zadá preference:
   - "Nechci dvě zkoušky v jednom týdnu"
   - "Statistiku chci co nejdřív"
   - "Od 20. 6. jedu na dovolenou"
4. Klikne "Vygenerovat plán"
5. AI navrhne plán:
   - Chronologický seznam zkoušek
   - Zdůvodnění pořadí
   - Tipy na přípravu
   - Varování (blízké termíny, těžké předměty za sebou)
6. Student si podle plánu zapíše termíny v InSIS
```


## Flow 4: Aktualizace dat

Vyučující změní termín nebo podmínky.

```
1. Student otevře detail předmětu
2. Klikne "Upravit"
3. Změní příslušnou položku (datum termínu, váhu hodnocení, ...)
4. Uloží
5. Dashboard a kalendář se automaticky aktualizují
```


## Flow 5: Export / sdílení

```
1. Student klikne "Export dat"
2. Stáhne JSON soubor
3. Může ho:
   - Záloha na disk
   - Sdílet spolužákovi (ten udělá "Import")
   - Přenést na jiný počítač
```


---

## Wireframe — Formulář předmětu

```
┌─────────────────────────────────────────────────────┐
│ ← Zpět                         PŘIDAT PŘEDMĚT       │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ZÁKLADNÍ INFO                                       │
│  ┌─────────────────────────────────────────┐         │
│  │ 🔍 Vybrat předmět z katalogu FIS    ▾  │         │
│  └─────────────────────────────────────────┘         │
│  Kód: 4IT115  Název: Softwarové inž.  Kredity: 6    │
│  Semestr: [LS 2025/26 ▾]                            │
│  Vyučující: [________________________]               │
│                                                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  SLOŽKY HODNOCENÍ                    Suma: 100% ✓   │
│  ┌─────────────────────────────────────────────┐     │
│  │ Název: [Průběžný test      ]  Typ: [Test ▾] │     │
│  │ Váha:  [30] %   Max: [30] b   Min: [15] b  │     │
│  │ Popis: [Přednášky 1-6, 60 min...         ]  │     │
│  │                                      [🗑️]   │     │
│  └─────────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────────┐     │
│  │ Název: [Závěrečná zkouška ]  Typ: [Zk. ▾]  │     │
│  │ Váha:  [70] %   Max: [70] b   Min: [35] b  │     │
│  │ Popis: [Písemná zkouška...                ]  │     │
│  │                                      [🗑️]   │     │
│  └─────────────────────────────────────────────┘     │
│  [+ Přidat složku]                                   │
│                                                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  TERMÍNY                                             │
│  ┌─────────────────────────────────────────────┐     │
│  │ Název: [Průběžka        ]  Typ: [Test ▾]    │     │
│  │ Datum: [15.4.2026]  Čas: [10:00]  📍[NB A]  │     │
│  │                                      [🗑️]   │     │
│  └─────────────────────────────────────────────┘     │
│  [+ Přidat termín]                                   │
│                                                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  PODMÍNKY SPLNĚNÍ                                    │
│  [Min. 50% z každé složky                    ] [🗑️]  │
│  [Povinná účast na cvičeních (max 2 absence) ] [🗑️]  │
│  [+ Přidat podmínku]                                 │
│                                                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  KLASIFIKACE   [Standardní VŠE ▾]                    │
│  A ≥90%  B ≥75%  C ≥65%  D ≥55%  E ≥50%  F <50%    │
│                                                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  POZNÁMKY                                            │
│  [                                               ]   │
│  [                                               ]   │
│                                                      │
│  [  ✓ Uloží předmět  ]   [ Zrušit ]                 │
│                                                      │
└─────────────────────────────────────────────────────┘
```


## Wireframe — Dashboard s týdnem výuky

```
┌─────────────────────────────────────────────────────┐
│ [VŠE] STUDYHUB    Přehled  Kalendář  Přidat  Plán   │
├─────────────────────────────────────────────────────┤
│                                                      │
│  PŘEDMĚTY 7    KREDITY 33    📅 6. TÝDEN VÝUKY       │
│                                                      │
│  ── NEJBLIŽŠÍ UDÁLOSTI ──────────────────────        │
│  ┌──────┐ ┌──────┐ ┌──────┐                         │
│  │15 dub│ │22 dub│ │ 5 kvě│  →                       │
│  │Midtrm│ │Odevz.│ │Zkouš.│                         │
│  │Stat. │ │IS prj│ │Mikroe│                         │
│  └──────┘ └──────┘ └──────┘                         │
│                                                      │
│  ── PŘEDMĚTY ────────────────────────────────        │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐       │
│  │▬▬▬▬▬▬▬▬▬▬▬▬│ │▬▬▬▬▬▬▬▬▬▬▬▬│ │▬▬▬▬▬▬▬▬▬▬▬▬│       │
│  │4IT115    (6)│ │4ST204   (5)│ │3MI202   (5)│       │
│  │Soft. inž.  │ │Statistika  │ │Mikroeko I  │       │
│  │doc.Novák   │ │prof.Dvořák │ │doc.Králová │       │
│  │▓▓▓▓░░░░░░░░│ │▓▓▓▓▓░░░░░░░│ │▓▓▓░░░░░░░░░│       │
│  │Test30 Zk70 │ │DU15 Mid25..│ │Mid40 Zk60  │       │
│  │─────────── │ │─────────── │ │─────────── │       │
│  │Test za 12d │ │DÚ za 5d    │ │Zk za 45d   │       │
│  └────────────┘ └────────────┘ └────────────┘       │
│                                                      │
└─────────────────────────────────────────────────────┘
```
