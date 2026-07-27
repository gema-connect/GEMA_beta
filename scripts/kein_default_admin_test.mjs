// Drift-Guard: KEIN fest eingebauter Benutzer im ausgelieferten Code
// (Sicherheits-Bereinigung 27.07.2026)
//
// gema_auth.js geht als Klartext an jeden Browser. Ein dort hinterlegter
// Default-Administrator ist damit eine öffentlich lesbare Zugangsdatei — und
// über den Legacy-Login-Pfad (greift, wenn die gema-auth-Function nicht
// erreichbar ist) ein funktionierender Admin-Zugang. Dieser Test schlägt an,
// sobald so ein Seed zurückkommt.
//
// Ausführen: node scripts/kein_default_admin_test.mjs   (kein Browser nötig)
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n); } };

/* ── 1) gema_auth.js: kein Benutzer-Seed mehr ─────────────────── */
console.log('■ gema_auth.js');
{
  const s = readFileSync(join(ROOT, 'gema_auth.js'), 'utf8');
  ok(!/DEFAULT_USERS/.test(s), 'keine DEFAULT_USERS-Konstante');
  ok(!/gema2025/i.test(s), 'das frühere Seed-Passwort ist weg');
  ok(!/user_admin/.test(s), 'keine Referenz auf den Seed-Benutzer');
  ok(!/admin@gema\.ch/.test(s), 'keine Seed-E-Mail');
  // Der Merge darf für Benutzer keine Defaults mehr kennen
  ok(!/storageKey === STORAGE_USERS \?/.test(s), '_mergeWithDefaults ergänzt keine Benutzer');
  // Orgs und Rollen behalten ihre Defaults (System-Rollen, GEMA-Org)
  ok(/DEFAULT_ROLES/.test(s) && /DEFAULT_ORGS/.test(s), 'Rollen- und Org-Defaults bleiben (System-Rollen)');
  ok(/_writeLocalCache\(STORAGE_ROLES, DEFAULT_ROLES\)/.test(s), '_initDefaults seedet weiterhin die System-Rollen');
  // Gesucht ist NUR das Seeding (_writeLocalCache) — der Cloud-Pull und die
  // Blob-Migration im selben Rumpf nennen STORAGE_USERS zu Recht.
  ok(!/_writeLocalCache\(\s*STORAGE_USERS\s*,\s*DEFAULT/.test(s), '_initDefaults seedet KEINE Benutzer');
}

/* ── 1b) Kein Client-seitiger Login mehr ──────────────────────── */
// Der Legacy-Pfad verglich Passwoerter IM BROWSER und legte eine Sitzung
// OHNE JWT an. Unter RLS liest so eine Sitzung nichts (gema_sync loggt sie
// aus) — und solange die Function fehlt, waere sie ein Login am
// serverseitigen Rechte-Check vorbei. Anmeldung laeuft ausschliesslich
// ueber netlify/functions/gema-auth.js.
console.log('■ Kein Client-Login');
{
  const s = readFileSync(join(ROOT, 'gema_auth.js'), 'utf8');
  ok(!/\blogin\s*:\s*function/.test(s), 'gema_auth.js hat keine login()-Methode mehr');
  ok(/loginAsync\s*:\s*function/.test(s), 'loginAsync (Function-Weg) ist weiterhin da');
  ok(!/\bactivateInvitation\s*:\s*function/.test(s), 'keine synchrone activateInvitation mehr');
  ok(/activateInvitationAsync\s*:\s*function/.test(s), 'activateInvitationAsync bleibt');
  ok(!/\.password\s*===|===\s*[a-z_]*\.password\b/i.test(s), 'kein Passwort-Vergleich im Client');

  const l = readFileSync(join(ROOT, 'sys_login.html'), 'utf8');
  ok(!/GemaAuth\.login\s*\(/.test(l), 'sys_login.html ruft kein GemaAuth.login mehr');
  ok(!/GemaAuth\.saveUsers\s*\(/.test(l), 'sys_login.html legt keine Benutzer client-seitig an');

  // Repo-weit: niemand sonst darf den Legacy-Einstieg wiederbeleben
  const EXT2 = new Set(['.js', '.html']);
  const SKIP2 = new Set(['node_modules', '.git', 'vorlagen', 'scripts', 'netlify']);
  const treffer2 = [];
  (function walk(dir) {
    for (const n of readdirSync(dir)) {
      if (SKIP2.has(n)) continue;
      const p = join(dir, n);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!EXT2.has(extname(n))) continue;
      const txt = readFileSync(p, 'utf8');
      txt.split('\n').forEach((z, i) => {
        if (/GemaAuth\.(login|activateInvitation)\s*\(/.test(z))
          treffer2.push(p.slice(ROOT.length + 1) + ':' + (i + 1) + ' → ' + z.trim().slice(0, 90));
      });
    }
  })(ROOT);
  if (treffer2.length) treffer2.forEach(t => console.log('    ' + t));
  ok(treffer2.length === 0, 'kein Modul ruft den Legacy-Login auf');
}

/* ── 2) Repo-weit: keine hartcodierten Zugangsdaten ───────────── */
console.log('■ Repo-Scan (.js/.html/.mjs)');
{
  const EXT = new Set(['.js', '.html', '.mjs']);
  const SKIP = new Set(['node_modules', '.git', 'vorlagen']);
  const files = [];
  (function walk(dir) {
    for (const n of readdirSync(dir)) {
      if (SKIP.has(n)) continue;
      const p = join(dir, n);
      if (statSync(p).isDirectory()) walk(p);
      // Der Guard selbst nennt das gesuchte Muster — sonst findet er sich selbst
      else if (EXT.has(extname(n)) && n !== 'kein_default_admin_test.mjs') files.push(p);
    }
  })(ROOT);

  const treffer = [];
  for (const f of files) {
    const txt = readFileSync(f, 'utf8');
    txt.split('\n').forEach((z, i) => {
      // Zugangsdaten-Muster: password/passwort mit Literal-Wert. Test-Fixtures
      // (Fake-JWTs) und Feldnamen sind bewusst NICHT gemeint.
      if (/(password|passwort|passwd)\s*[:=]\s*['"][^'"]{3,}['"]/i.test(z)
          && !/type\s*=|placeholder|autocomplete|['"]password['"]\s*[,)\]]|name:|label|\.value/i.test(z)) {
        treffer.push(f.slice(ROOT.length + 1) + ':' + (i + 1) + ' → ' + z.trim().slice(0, 100));
      }
      if (/gema2025/i.test(z)) treffer.push(f.slice(ROOT.length + 1) + ':' + (i + 1) + ' → Seed-Passwort');
    });
  }
  if (treffer.length) treffer.forEach(t => console.log('    ' + t));
  ok(treffer.length === 0, 'keine hartcodierten Passwörter in ausgelieferten Dateien');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
