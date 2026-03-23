# Claude Code für GEMA einrichten – Schritt-für-Schritt

## Was du brauchst

- Einen **Claude Pro-** oder **Max-Plan** (Pro = $20/Monat, Max = ab $100/Monat)
- Ein **GitHub-Konto** (gratis: github.com)
- Deinen GEMA-Code in einem GitHub-Repository

---

## Schritt 1: GitHub-Repository erstellen

Falls du noch kein GitHub-Repo für GEMA hast:

1. Gehe zu **github.com** → Registrieren (falls nötig)
2. Klick auf **"New Repository"** (grüner Button oben rechts)
3. Name: `gema` (oder wie du willst)
4. **Private** auswählen (dein Code bleibt privat!)
5. Klick auf **"Create repository"**

### GEMA-Dateien hochladen

**Variante A – Über die Website (am einfachsten):**
1. Im neuen Repo klick auf **"uploading an existing file"**
2. Ziehe deinen gesamten GEMA-Ordner rein (alle HTML, JS, CSS-Dateien)
3. Klick auf **"Commit changes"**

**Variante B – Mit Git (falls installiert):**
```bash
cd /pfad/zu/deinem/gema-ordner
git init
git add .
git commit -m "GEMA initial upload"
git remote add origin https://github.com/DEIN-USERNAME/gema.git
git push -u origin main
```

---

## Schritt 2: CLAUDE.md ins Repo legen

Die Datei `CLAUDE.md`, die ich dir erstellt habe, muss ins **Root-Verzeichnis** deines Repos (also auf der obersten Ebene, neben deinen HTML-Dateien).

1. Lade die `CLAUDE.md`-Datei herunter, die ich dir hier bereitstelle
2. Im GitHub-Repo: **"Add file"** → **"Upload files"**
3. `CLAUDE.md` hochladen
4. **"Commit changes"**

Claude Code liest diese Datei automatisch bei jedem Start.

---

## Schritt 3: Claude Code auf dem Web starten

1. Gehe zu **claude.ai/code**
2. Melde dich mit deinem Claude-Konto an
3. **GitHub verbinden**: Du wirst aufgefordert, dein GitHub-Konto zu verknüpfen (OAuth – sicher, keine Passwörter)
4. Wähle dein **gema**-Repository aus
5. Fertig – Claude Code öffnet sich mit deinem Projekt

---

## Schritt 4: Loslegen

Jetzt kannst du Claude Code Aufgaben geben. Beispiele:

### Einfacher Bug-Fix
```
Öffne sb_druckerhoehung.html und prüfe ob alle Inputs das korrekte 
Pattern haben (type="text" inputmode="decimal" mit fixLeadingZero).
Fix alle die nicht stimmen.
```

### Batch-Änderung
```
Prüfe alle 16 sb_*.html Module ob die Navigation die einheitlichen 
.g-nav-* Klassen verwendet. Erstelle eine Liste der Abweichungen 
und fixe sie.
```

### Neues Modul erstellen
```
Erstelle ein neues Modul sa_enthaertung.html nach dem gleichen 
Pattern wie die anderen Sanitärberechnungs-Module. Lies die 
CLAUDE.md für alle Konventionen. Das Modul soll eine Berechnung 
für Enthärtungsanlagen enthalten.
```

### Smoke-Test über alle Module
```
Schreibe ein Script das alle HTML-Dateien im Repo öffnet und prüft:
1. Keine orphaned </div>-Tags
2. Alle Inputs haben type="text" (keine type="number")
3. GemaDB-Aufrufe haben typeof-Guards
4. .g-nav Klasse vorhanden
Gib mir einen Report was gefunden wurde.
```

---

## So sieht der Workflow aus

```
Du gibst Aufgabe ein
        ↓
Claude Code liest CLAUDE.md + relevante Dateien
        ↓
Claude Code macht Änderungen (kann mehrere Dateien gleichzeitig)
        ↓
Claude Code erstellt einen Branch (z.B. "claude/fix-inputs")
        ↓
Du siehst den Diff (was geändert wurde)
        ↓
    ┌───────────────────────────────┐
    │  Zufrieden?                   │
    │                               │
    │  JA → "Create PR" klicken     │
    │       → Branch mergen         │
    │                               │
    │  NEIN → Branch verwerfen      │
    │         → Hier im Chat        │
    │           weiterarbeiten      │
    └───────────────────────────────┘
```

---

## Tipps

- **Sei spezifisch**: Je genauer deine Anweisung, desto besser das Resultat
- **Referenziere die CLAUDE.md**: Sag z.B. "gemäss den Konventionen in CLAUDE.md"
- **Mehrere Sessions**: Du kannst parallele Aufgaben laufen lassen
- **Preview**: Für visuelle Kontrolle nutze GitHub Pages (Repo Settings → Pages → Branch auswählen) um die HTML-Dateien direkt im Browser zu sehen
- **Zurück zum Chat**: Jederzeit! Datei herunterladen und hier hochladen

---

## Kosten-Überblick

| Plan | Preis | Claude Code |
|------|-------|-------------|
| Pro | $20/Monat | Limitiertes Kontextfenster |
| Max 5 | $100/Monat | Grösseres Kontextfenster, mehr Nutzung |
| Max 20 | $200/Monat | 1M Token Kontext, parallele Agents |

Für GEMA reicht **Pro** zum Starten. Falls du viele Batch-Operationen machst, lohnt sich Max.
