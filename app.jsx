# Handoff: GEMA Workspace-Ansicht („Eimer-View")

## Overview
A workspace-centric working environment for the GEMA SaaS platform (Swiss
sanitary / building-services planners). Complements the existing module
overview by giving each user a set of "Eimer" (buckets) — flexible workspaces
that group modules (calculations/apps), notes, and activity in one place.

A "Eimer" can be:
- A real building project
- A training/exercise environment
- A private sandbox
- A shared team workspace

Each Eimer belongs to an organisation (e.g. Jäggi Vollmer, AGS, FHNW).

## About the Design Files

The files in this bundle are **design references created in HTML/JSX** —
prototypes showing intended look and behaviour, not production code to copy
directly. The task is to **recreate these designs inside the target codebase's
existing environment** (React, Vue, SwiftUI, native, etc.) using its
established patterns, component library, and routing/state primitives.

If no environment exists yet, choose the most appropriate framework — given
the heavy use of side-by-side panels, contenteditable notes, and tab state,
React + a lightweight state container (Zustand, Redux Toolkit, or React
Context) is a reasonable default.

## Fidelity

**High-fidelity (hifi).** Final colours, typography, spacing, radii, shadows,
and interactions. Recreate pixel-perfectly using the codebase's existing UI
kit. Do not reuse the prototype CSS verbatim — instead, map the tokens listed
under **Design Tokens** below to the equivalents in the target system.

## Layout

The page is a fixed-height app shell, three-column desktop-first:

```
┌──────────────────────────────────────────────────────────────────────┐
│  Topbar (56px) — brand · search · empty-state toggle · avatar        │
├────────────┬─────────────────────────────────────────────────────────┤
│            │  Tab bar (browser-style, 36px)                          │
│  Sidebar   ├──────────────────────────────────┬──────────────────────┤
│  280px     │  Content (flex)                  │  Notes (360px)       │
│            │   • Header (name editable)       │   • Page tabs        │
│            │   • Module grid                  │   • Editor (notes)   │
│            │   • Activity feed                │   • Admin tree       │
│            │   • Beteiligte (collapsible)     │                      │
└────────────┴──────────────────────────────────┴──────────────────────┘
```

Responsive collapses:
- ≤ 1024 px: Notes column moves below content (max 50 vh) — or becomes a
  bottom-sheet / right-drawer in a real implementation.
- ≤ 720 px: Sidebar collapses to a hamburger drawer; topbar search hides.

---

## Screens / Views

### 1. Workspace (default state, with data)

**Purpose** — User picks a bucket, sees its modules, recent activity, and
project notes side-by-side.

**Sidebar (280 px)**
- User block: 40 px round avatar (`#0c4a2e`, white initials "SC", weight 600),
  name "Sandra Caso" (14 px / 600), role "Sanitärplanerin" (12 px / `#94a3b8`).
  Both name and role single-line, ellipsis on overflow. 1 px bottom divider
  (`#EEF1F4`).
- Org switcher: section label "ORGANISATION" (10.5 px / 600 / 0.09 em /
  uppercase / `#94a3b8`). Pills row: "JV", "AGS", "FHNW", "Alle". Inactive
  pill — `#F4F5F7` bg, `#475569` text. Active pill — `#0f172a` bg, white
  text. "Alle" pill, when active, uses the **brand gradient**
  (`linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0c4a2e 100%)`).
- Sections "Persönliche Eimer" and "Geteilte Eimer" with the same heading
  style. Each has:
  - List of bucket rows: 12 px radius, 8 px / 10 px padding, 13 px text.
    Hover `#F4F5F7`. Active `#EDF1F7`. **Open** (i.e. has a tab open) —
    show a 3 × 14 px gradient pill on the left edge.
  - Bucket row content: type icon (16 px) → name (truncate) → for shared
    buckets, an avatar cluster of up to 3 members (–8 px overlap, 22 px
    avatars, `#fff` 2 px ring), with `+N` overflow chip.
  - When > 5 buckets: "… N mehr" toggle.
  - "+ Neuer Eimer" button — dashed border, hover navy.
  - When list is empty: italic hint "Noch keine Eimer".
- Footer: "VERKNÜPFTE ORGS" with org tags (11 px, `#EFF4FB` bg, `#3B82F6`
  text, 6 px radius).

**Tab bar**
- Background `linear-gradient(180deg, #F0F2F5 0%, #E9ECF0 100%)`, 1 px bottom
  border `#E5E7EB`. Padding `8px 12px 0`.
- Tabs: 10 px top-radius, 8 / 12 padding, max-width 220 px, 12.5 px text.
  Inactive `#DFE3E8`. Active `#fff` with a 2 px brand-gradient strip across
  the top edge (rendered as `::before`). Each tab: 14 px type icon → name
  (truncate) → 12 px close (×) button (18 × 18 hover background
  `rgba(15,23,42,0.08)`).
- "+" tab on the right opens the bucket picker.

**Content header** (white, 1 px bottom border)
- 36 × 36 type-icon tile (radius 12, gradient
  `linear-gradient(135deg, #F0F4FA 0%, #E8F0EA 100%)`).
- Title h1 — DM Sans 600, 24 px, letter-spacing −0.015 em. Click anywhere on
  the title to enter edit mode (contenteditable). Edit-mode style: 2 px navy
  ring. Enter commits, Esc cancels.
- Meta row (12.5 px, `#475569`): Org name · "N Mitglied(er)" with users icon
  · "erstellt DD.MM.YYYY". Separators are middle-dot `·` in `#94a3b8`.
- Right-aligned actions: "+ Einladen" and "Geteilt: N Personen" (or "Teilen"
  for un-shared). Both ghost buttons — `#F4F5F7` bg, 13 px / 500, 12 px
  radius, 8 / 14 padding.

**Module grid**
- Section heading "MODULE" + count chip (`#EEF1F4` bg, 11 px, `#94a3b8`).
- `display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px`.
- Module tile: white card, 1 px `#E5E7EB` border, **20 px** radius, shadow-1
  (`0 1px 2px rgba(15,23,42,0.04), 0 2px 4px rgba(15,23,42,0.03)`), 16 px
  padding. Layout: 44 × 44 icon tile (12 px radius, light gradient bg,
  `#1e3a5f` icon) → name (14 px / 600) + status row.
- Status row: 7 px dot + label. Open — `#94a3b8`. Berechnet — `#10B981`
  with 3 px ring `rgba(16,185,129,0.16)`.
- Hover: `translateY(-2px)`, shadow-2, icon tile flips to **brand gradient**
  with white icon. 220 ms ease.
- "+" tile: dashed border, white inner plus chip, label "Modul hinzufügen".
  Hover: navy border + `#F8FAFC` bg.

**Empty modules state (single bucket)**
- Replace grid with a hero CTA: dashed white card, 40 / 24 padding. 56 × 56
  gradient plus tile, 17 px / 600 title "Erstes Modul hinzufügen", 13 px
  `#94a3b8` subtext.

**Activity feed**
- White card, 20 px radius, 1 px border. Title "AKTIVITÄT". Items: 28 px
  avatar → "**WHO** action text · *time*". Avatar palette: SC `#0c4a2e`,
  RV `#1e3a5f`, SG `#3B82F6`, TM `#7c3aed`, JK `#F59E0B`, BL `#10B981`.

**Beteiligte (collapsible)**
- Same card style. Header is a button — title + count chip + chevron-down.
  Chevron rotates 180° when open. 220 ms.
- Rows: 32 px grey avatar (`#475569`) with 2-letter initials → "Name *· Role*"
  + small org line (12 px / `#94a3b8`).

### 2. Notes panel (right column, 360 px)

- Background `linear-gradient(180deg, #FFFBEB 0%, #FFF8E0 100%)`, 1 px left
  border. The whole panel is the warm-orange OneNote-style affordance.
- Header (18 / 20 padding): note icon + title "NOTIZEN / PENDENZEN" (13 px /
  600 / uppercase / `#F59E0B`). Right side has a grip / options icon button.
- Page tabs row (16 px horizontal, 1 px bottom border `rgba(245,158,11,0.16)`):
  - Tab — 12.5 px, 8 / 12 padding, 2 px bottom border, 6 px top radius.
  - Active tab — `#F59E0B` text + 2 px bottom border same colour, 500 weight.
  - Hover — `rgba(245,158,11,0.08)` bg.
  - "+" tab on the right adds a new page; double-click any tab to rename.
- Editor: `contentEditable`, 18 / 22 padding, 14 px / 1.55 line-height.
  - `h3` — 14 px / 600.
  - `ul[data-checklist]` — checklist with custom box (16 px square, 5 px
    radius, 1.5 px `#d6c08a` border, white bg). Checked state — `#F59E0B`
    fill, white tick (CSS pseudo-elements). Click on the leftmost 28 px of
    a list item to toggle. Checked items go strikethrough + `#94a3b8`.
  - `[data-sitzung]` block — white card, 1 px `rgba(245,158,11,0.25)` border,
    12 px radius, 14 / 16 padding.
  - `[data-participants]` pill — inline-block, 11 px / 600 uppercase 0.04 em,
    `#F59E0B` text on `rgba(245,158,11,0.1)` bg, 999 px radius.
- Admin tree (collapsible, at the bottom):
  - Card with 0.7 alpha white bg, `rgba(245,158,11,0.18)` border, 16 px
    side margin.
  - Tree: nested `ul`s, no list-style, `padding-left: 14px`, with
    `border-left: 1px dashed rgba(245,158,11,0.35)` showing hierarchy.
  - Roles in `<em>` (not italic) `#94a3b8`.

### 3. Empty state (no buckets yet)

- Replaces the entire centre + right area when there are no buckets.
- Background — radial gradients top-left navy 4 % and bottom-right green 4 %
  on top of `#FAFAFA`.
- Content max-width 760 px, centred.
- 64 × 64 brand-gradient badge (18 px radius, shadow-3) with bucket icon.
- Hero h1 — 36 px / 600, letter-spacing −0.02 em, **clipped to brand
  gradient via `background-clip: text`**.
- Subhead — 15 px / `#475569`, max-width 540 px, `text-wrap: pretty`.
- 3 cards in a 1 × 3 grid (14 px gap):
  - **Bauprojekt** — `#1e3a5f` icon (`building`) — "Reales Objekt mit Adresse und Bauherr"
  - **Übungsumgebung** — `#3B82F6` icon (`grad`) — "Sandbox zum Lernen und Testen"
  - **Privater Eimer** — `#64748b` icon (`lock`) — "Persönlicher Arbeitsraum, nur für dich"
- Each card: white, 20 px radius, 1 px border, shadow-1, 22 / 20 padding,
  flex column with 8 px gap. Hover — `translateY(-3px)`, shadow-3,
  transparent border. CTA "Eimer anlegen →" gains 4 px gap on hover.
- Below: ghost text-button "Oder eigenen Namen vergeben →" — opens the
  custom new-bucket modal.

When user clicks a card, **immediately create** a bucket of that type, with
preset name ("Mein erstes Bauprojekt" / "Übungsumgebung" / "Privater Eimer"),
push it as a tab, and switch to the workspace view (which then shows the
"Erstes Modul hinzufügen" hero).

### 4. Modals

All modals: backdrop `rgba(15,23,42,0.32)` + 3 px backdrop-blur, fade-in
180 ms; dialog white, 20 px radius, shadow-3, max-width 480–560 px,
modal-in 220 ms `cubic-bezier(.2,.7,.2,1)`. Header — 17 px / 600 title,
right-aligned close. Body padding `6 22 22`.

**Neuer Eimer** (520 px) — fields:
1. Name — text input (`#E5E7EB` border, 12 px radius, 10 / 14 padding;
   focus: navy border + 3 px `rgba(30,58,95,0.12)` ring).
2. Typ — 4-up grid of cards: Bauprojekt / Übung / Privat / Team. Inactive
   `#F4F5F7`. Active white + navy border + 500 weight.
3. Organisation — pills (hidden when type = Privat). Active pill same
   "Alle"-style as sidebar but without gradient.
4. Footer: ghost "Abbrechen" + primary "Eimer erstellen" (gradient bg,
   shadow-2, hover translateY −1 + shadow-3, disabled at 0.5 opacity).

**Modul-Picker** (560 px) — list of all modules (Enthärtung, Osmose,
LU-Tabelle, W12, Druckerhöhung, Speicher). Each row: 40 × 40 light-gradient
icon tile + name (14 / 600) + 12.5 px description. Hover `#F4F5F7` bg with
1 px border. Already-added rows — 0.5 opacity, "bereits hinzugefügt" tag,
disabled.

**Eimer-Picker** (480 px) — opened by the "+" tab. Lists buckets that are
not currently open as a tab. Empty case — italic hint.

### 5. Toast

- Bottom-centre, fixed, dark pill (`#0f172a`), white text 13 px, 10 / 18
  padding, 999 px radius, shadow-3.
- 240 ms slide-up enter, auto-dismiss after 2.2 s.
- Used for: module open feedback, "Modul hinzugefügt", rename confirmations,
  share/invite stubs, demo-data toggle.

---

## Interactions & Behaviour

All 11 interactions must work end-to-end:

1. **Tab switch** — click another tab → content + notes column swap. No
   route change in the prototype, but the real impl can use a `?bucket=ID`
   query param.
2. **Tab close** — × button stops propagation, removes tab from `openTabs`,
   activates the tab that was at the same index (or the last tab).
3. **Neuer Eimer** — sidebar "+ Neuer Eimer" opens the modal; submit
   creates, pushes a tab, focuses it.
4. **Open bucket from sidebar** — click a bucket row: if not in tabs, push;
   focus the tab regardless.
5. **Module click** — toast "Öffne Modul …". In production this would
   navigate to the module's existing route.
6. **Add module** — "+" tile or hero CTA opens the module picker; pick →
   appends `{mod, status: 'offen'}` to `bucket.modules` and prepends an
   activity entry.
7. **Edit notes** — `contentEditable` div; on `input`, persist to
   `bucket.notes[id].body`. Click leftmost 28 px of a checklist `<li>` to
   toggle `data-checked`.
8. **Switch note page** — page tabs swap the editor's `innerHTML`. Use a
   ref guard so we only rewrite on `activePageId` / `bucket.id` change, not
   on every keystroke.
9. **Org filter** — sidebar pills filter the personal + shared lists by
   `bucket.org`. "Alle" disables filter.
10. **Empty-state toggle** — topbar button (also in Tweaks panel) flips
    between full demo data and zero buckets.
11. **Rename bucket** — click the title; contenteditable; Enter commits,
    Esc reverts.

### Animation tokens
- `--t: 220ms cubic-bezier(.2,.7,.2,1)` on most state changes.
- Modal in: 220 ms with `translateY(8px) scale(0.98)` start.
- Toast in: 240 ms `translateY(8px)`.
- Hover lifts: `translateY(-1px..-3px)` + shadow swap.

### Empty / error / loading
- The prototype omits real loading + error states. In production:
  - Sidebar list — show 4–6 skeleton rows.
  - Content — skeleton header + skeleton tile grid.
  - Notes — skeleton paragraphs.
- Form validation — only "name required" on the new-bucket modal (button
  disabled until trimmed name is non-empty).

### Responsive

- Container queries are not used — plain media queries are fine. The
  workspace grid switches from `1fr 360px` to `1fr` at 1024 px, and the
  notes column's max-height clamps to 50 vh.
- At 720 px, the sidebar becomes a Hamburger drawer (not implemented in
  prototype — implement in real app).

---

## State Management

Top-level (in `app.jsx`):

```ts
type Bucket = {
  id: string;
  name: string;
  type: 'project' | 'training' | 'private' | 'shared';
  org: string;            // org id
  shared: boolean;
  members: string[];      // 2-letter initials
  created: string;        // 'DD.MM.YYYY'
  modules: { mod: string; status: 'offen' | 'berechnet' }[];
  activity: { who: string; text: string; when: string }[];
  beteiligte: { role: string; name: string; org: string }[];
  notes: { id: string; title: string; body: string /* HTML */ }[];
};

mode: 'full' | 'empty'
activeOrg: 'all' | <orgId>
buckets: Bucket[]
personalIds: string[]
sharedIds: string[]
openTabs: string[]
activeTab: string | null
newBucketOpen, pickerOpen, bucketPickerOpen: bool
toast: { text, icon, key } | null
```

State transitions: see `app.jsx` — `createBucket`, `renameBucket`,
`closeTab`, `addModule`, `updateNote`, `addNotePage`, `renameNotePage`,
`loadFull`, `loadEmpty`.

In a real backend-backed implementation, replace these with mutations
(REST/GraphQL/RPC). The notes editor should debounce its `onInput`
persistence (e.g. 400 ms) before sending to the server.

---

## Design Tokens

### Colours
| Token | Value | Use |
|---|---|---|
| `--bg` | `#FAFAFA` | App background |
| `--card` | `#FFFFFF` | Cards, modals, headers |
| `--ink` | `#0f172a` | Primary text |
| `--ink-2` | `#475569` | Secondary text |
| `--ink-3` | `#94a3b8` | Tertiary text, meta |
| `--line` | `#E5E7EB` | Card borders, dividers |
| `--line-2` | `#EEF1F4` | Subtle inner dividers |
| `--navy` | `#1e3a5f` | Primary brand mid |
| `--green-deep` | `#0c4a2e` | Primary brand end / SC avatar |
| `--green` | `#10B981` | Success / "berechnet" |
| `--blue` | `#3B82F6` | Org tags, training type |
| `--accent-notes` | `#F59E0B` | Notes panel accent |
| Brand gradient | `linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0c4a2e 100%)` | Hero CTAs, active tab strip, primary button, "Alle" pill |
| Light tile gradient | `linear-gradient(135deg, #F0F4FA 0%, #E8F0EA 100%)` | Idle module-icon tile bg |
| Notes panel gradient | `linear-gradient(180deg, #FFFBEB 0%, #FFF8E0 100%)` | Notes panel bg |

### Typography
- Family: **DM Sans** (Google Fonts), weights 400 / 500 / 600 / 700.
- `font-feature-settings: 'ss01' on, 'cv11' on;` for slightly more humanist
  digit / "a" forms.
- Sizes: 11 (uppercase labels) · 12 (meta) · 12.5 (tab labels, sub-meta) ·
  13 (body buttons) · 13.5 (people row) · 14 (body, module name) · 14
  (notes body) · 15 (empty subhead) · 17 (modal title, hero CTA title) ·
  24 (bucket title) · 36 (empty hero).
- Letter-spacing: `−0.02 em` on big hero, `−0.015 em` on h1, `−0.01 em` on
  modal title / hero CTA title, `0.08–0.09 em` on uppercase labels.

### Spacing
- Topbar height: 56.
- Sidebar width: 280. Notes width: 360.
- Card padding: 16 (modules), 14/18 (activity / beteiligte heads), 18/22
  (notes editor), 22/20 (empty cards).
- Section gaps inside content scroll: 24 (comfortable) / 16 (compact).
- Form gaps: 16 between fields, 8 between actions.

### Radii
- Cards/tiles/modals: **20 px**.
- Inputs/buttons/small controls: **12 px**.
- Tab tops: 10 px. Pills/avatars/toast: 999 px. Tags: 6 px.

### Shadows
```
--shadow-1: 0 1px 2px rgba(15,23,42,0.04), 0 2px 4px rgba(15,23,42,0.03);
--shadow-2: 0 4px 16px rgba(15,23,42,0.06), 0 1px 4px rgba(15,23,42,0.04);
--shadow-3: 0 12px 40px rgba(15,23,42,0.12), 0 4px 12px rgba(15,23,42,0.06);
```
Multi-layer, soft. No hard offset shadows.

### Motion
- Default: `220 ms cubic-bezier(.2,.7,.2,1)`. Modals/toasts 220–240 ms.
- Avoid fades > 300 ms or large translates. Swiss precision, restrained.

---

## Localisation

- All copy is **Swiss German** with real umlauts (ä ö ü). **Never** ae / oe
  / ue.
- Date format: `DD.MM.YYYY` with `.toLocaleDateString('de-CH')`.
- Pluralisation: "Mitglied" / "Mitglieder" handled inline (`members === 1`).

## Assets

- **Icons** — custom 24 × 24 stroke set in `icons.jsx` (Lucide-style
  geometry, redrawn). Replace with the codebase's existing icon library
  (lucide-react, Phosphor, Heroicons, etc.) — names map directly:
  `droplet`, `circle-dot`, `table`, `gauge`, `arrow-up`, `database`, `plus`,
  `x`, `chevron-down`, `check`, `pencil`, `users`, `user`, `bucket` (use a
  bucket / pail / inbox glyph), `share`, `note`, `lock`, `building`,
  `grad` (graduation cap), `inbox`, `grip`, `sparkle`, `refresh`.
- **Fonts** — DM Sans via Google Fonts. If self-hosting is required, fetch
  the four weights and update the `@font-face` block.
- **Images** — none. The design uses gradients + icons throughout.

## Files

All under `design_handoff_gema_workspace/`:
- `sys_workspace.html` — entry point. Loads React, Babel, DM Sans, then the
  JSX modules in order.
- `styles.css` — all styles. Tokens at the top under `:root`.
- `data.jsx` — mock data: orgs, modules catalogue, seed buckets, sample
  notes HTML.
- `icons.jsx` — `<Icon name=… size=… stroke=… />` SVG set.
- `sidebar.jsx` — `Sidebar`, `Avatar`, `AvatarCluster`, `BucketTypeIcon`.
- `tabs.jsx` — `TabBar`.
- `content.jsx` — `BucketContent`, `ModuleTile`, `EditableTitle`,
  `ActivityFeed`, `Beteiligte`, `HeroAddModule`.
- `notes.jsx` — `NotesPanel` (incl. checklist toggle + admin tree).
- `modals.jsx` — `EmptyState`, `Modal`, `NewBucketModal`,
  `ModulePickerModal`, `BucketPickerModal`, `Toast`.
- `app.jsx` — top-level state, all CRUD handlers, mode switching, Tweaks.
- `tweaks-panel.jsx` — design-time control panel; **drop in production**.

## Out of scope for this design

- Real auth and org membership.
- Module routing / module content (clicking a module just toasts).
- Real-time presence / activity feed pushes.
- Drag-to-reorder modules or buckets.
- Mobile drawer/bottom-sheet implementations (only collapsed CSS hints).
- Persistent storage of notes (in-memory only in the prototype).
