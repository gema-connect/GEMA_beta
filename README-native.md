# GEMA Native — Integrations-Bausteine (Variante 1c „Command-first")

Framework-freie iOS/iPadOS-Oberfläche für GEMA. Reine **Design- & Interaktionsebene** —
kein Framework, kein Build-Step. Dein Stack bleibt unberührt: **Vanilla JS, Netlify, Supabase.**

## Dateien

| Datei | Zweck |
| --- | --- |
| `gema-native.css` | Alle Stile als Klassen + Farb-/Form-Variablen in `:root`. Einmal pro Seite einbinden. |
| `gema-native.js` | Verhalten (Command-Palette, Push/Pop, Sheet, Long-Press-Menü, grosser Titel, Segmented, Pull-to-Refresh). Verdrahtet sich selbst über `data-`Attribute. |
| `gema-native-screens.html` | Screen-Baukasten: sechs gebaute Referenz-Screens (mit Demo-Rahmen). |

## Einbinden (2 Zeilen)

```html
<head>
  <link rel="stylesheet" href="gema-native.css">
</head>
<body>
  <!-- ... dein Screen ... -->
  <script src="gema-native.js" defer></script>
</body>
```

- Mehrseitig: In deiner Multi-Page-Struktur beide Dateien wie `gema_responsive.css` /
  `gema_*.js` global referenzieren; jede Modulseite nutzt dieselben Klassen.
- `viewport-fit=cover` + `env(safe-area-inset-*)` sind eingebaut → Notch/Home-Indikator sitzen korrekt.
- **Demo-Rahmen entfernen:** In `gema-native-screens.html` ist alles zwischen `.demo-phone`
  und dem `<style>`-Block nur Vorschau-Chrome. In Produktion steht `<div class="gn" data-gn-app>`
  direkt im `<body>` (mit `height:100vh`).

## So funktioniert die Verdrahtung (`data-`Attribute)

Ein Screen wird von einem Wrapper `[data-gn-app]` umschlossen. Beim Laden verbindet
`gema-native.js` automatisch alles darin. Nichts weiter aufzurufen.

| Muster | Auslöser | Ziel |
| --- | --- | --- |
| **Command-Palette** | `data-gn-cmd-open` (Button) | `[data-gn-cmd]` + `[data-gn-cmd-backdrop]`; schliessen: `data-gn-cmd-close` |
| **Bottom-Sheet** | `data-gn-sheet-open` | `[data-gn-sheet]` + `[data-gn-sheet-backdrop]`; Griff `[data-gn-grab]` = Ziehen zum Schliessen; schliessen: `data-gn-sheet-close` |
| **Push / Pop** | `data-gn-push="ID"` | `[data-gn-detail="ID"]` fährt herein; zurück: `data-gn-pop="ID"` |
| **Long-Press-Menü** | `data-gn-ctx="Titel"` auf einer Zeile/Kachel | `[data-gn-ctx-backdrop]`; Titel landet in `[data-gn-ctx-title]` |
| **Grosser Titel** | `[data-gn-scroll]` (Scrollfläche) | `[data-gn-compact]` blendet beim Scrollen ein |
| **Segmented** | `.gn-seg` mit `.gn-seg-opt` Kindern | schaltet `.is-active`; feuert Event `gn:segment` |
| **Stepper** | `[data-gn-stepper]` (`data-gn-step` / `-min` / `-max`) mit `[data-step="+"]`/`[data-step="-"]` | ändert `.gn-stepper-v`; feuert `gn:step` |
| **Wochenstreifen** | `.gn-weekstrip` mit `.gn-day` Kindern (`.has-dot` = Termine) | schaltet `.is-active`; feuert Event `gn:day` |
| **Pull-to-Refresh** | `data-gn-ptr` auf einer Scrollliste | Spinner `.gn-ptr-spinner` daneben |

Alle Overlays öffnen/schliessen über die Klasse **`.is-open`** — auch aus deinem eigenen
Code steuerbar: `document.querySelector('[data-gn-detail="ww"]').classList.add('is-open')`.

## An echte Daten anschliessen (Supabase)

Das ist reines UI — deine bestehende Logik bleibt. Typische Verbindungspunkte:

```js
// 1) Command-Palette-Eintrag -> deine Route/Funktion
document.querySelector('[data-gn-push="ww"]').addEventListener('click', () => {
  // z. B. Modul laden / Supabase-Query starten
});

// 2) Pull-to-Refresh gibt ein Promise zurück -> Spinner läuft bis fertig
const list = document.querySelector('[data-gn-ptr]');
list.__gnRefresh = async () => { await ladeAusSupabase(); render(); };

// 3) Segmented-Umschalter
document.querySelector('.gn-seg').addEventListener('gn:segment', e => {
  console.log(e.detail.value); // "eingabe" | "ergebnis"
});

// 4) Nach dynamischem Nachladen eines Screens neu verdrahten:
GemaNative.init(neuerScreenWrapper); // oder GemaNative.boot()
```

## Themen / Farben

Alles über CSS-Variablen in `gema-native.css` → `:root`. GEMA-Blau ist Standard.

```css
:root{
  --gn-accent:#2563eb;             /* Marke */
  --gn-c-heizung:linear-gradient(135deg,#ea580c,#f59e0b);  /* Kategorie-Verläufe */
  --gn-bg:#eef1f8;                 /* App-Grund */
  --gn-r-card:16px;                /* Rundungen */
}
```

Modul-Icon einfärben: `<span class="gn-tile-ic" style="--gn-tile-bg:var(--gn-c-heizung)">`.

## Klassen-Kurzreferenz

- Layout: `.gn` (Wurzel) · `.gn-screen` (Scroll) · `.gn-header` · `.gn-toolbar` · `.gn-label`
- Home: `.gn-search` · `.gn-quick`+`.gn-chip` · `.gn-grid`+`.gn-tile` · `.gn-pill`+`.gn-pill-btn`
- Kopf-Aktionen: `.gn-icon-btn` (`--primary`) · `.gn-searchbar` (persistente Suche)
- Dashboard: `.gn-stats`+`.gn-stat` · `.gn-card`+`.gn-card-head` · `.gn-progress`
- Listen: `.gn-list` · `.gn-row` (`.gn-row--lg` für 2-zeilig) · `.gn-row-val` · `.gn-ava-sm` · `.gn-badge--ok/-warn/-danger/-info`
- Formular: `.gn-field`+`.gn-input` · `.gn-select` (in `.gn-list`) · `.gn-stepper` · `.gn-btn`
- Kalender: `.gn-weekstrip`+`.gn-day` (`.has-dot`/`.is-active`) · `.gn-agenda`+`.gn-event` (`--gn-event-c`) · `.gn-avatars`
- Detail: `.gn-detail` · `.gn-back` · `.gn-large-title` · `.gn-seg` · `.gn-kv` · `.gn-result`
- Overlays: `.gn-cmd*` · `.gn-sheet*` · `.gn-ctx*`

## Referenz-Screens

- **`index.html` — der Home-Screen ist live** (Springboard: `.gn-header` · `.gn-search` + Command-Palette ·
  `.gn-quick`/`.gn-chip` · `.gn-grid`/`.gn-tile` je Kategorie · `.gn-pill`). Die Kacheln liest der Screen
  aus dem DOM der klassischen Übersicht — er folgt damit automatisch der Permission-Filterung und jeder
  neuen Modul-Kachel. Details siehe CLAUDE.md › «GEMA Native».
- `gema-native-screens.html` — sechs gebaute Beispiele, jedes ein eigenständiger `.gn`-Screen:
  **Workspace** (KPI-Cockpit), **Druckdispositiv** (Berechnung/Formular),
  **Werkzeugmanagement** & **Fahrzeugmanagement** (Listen/Tabellen mit Badges + Long-Press),
  **Stundenerfassung** (Formular + Tages-Gruppen), **Einsatzplan** (Kalender/Agenda).
  Aus diesen leitet sich jeder weitere Screen ab.

## Weitere Screens bauen

Kopiere ein Muster aus `gema-native-screens.html` (die Screens decken Cockpit, Berechnung,
Liste, Formular und Kalender ab), tausche Inhalt/Icons, behalte Klassen und `data-`Attribute.
Für Listen-/Tabellen-Module: `.gn-toolbar` + `.gn-searchbar` + `.gn-seg` + `.gn-list` mit
`.gn-row--lg` und `.gn-badge`. Für Berechnungen: `.gn-seg` (Eingabe/Ergebnis) + `.gn-field`/
`.gn-stepper`/`.gn-select` + `.gn-result` + `.gn-detail-cta`.
