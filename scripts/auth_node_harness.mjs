// Laedt gema_auth.js OHNE Browser in einen Node-VM-Kontext.
//
// Warum: die Rollen-/Modul-Matrix (rolematrix_golden.json) und die
// Lieferanten-Freischaltung sind reine Datenlogik — sie brauchen kein
// Rendering. Der Playwright-Test (rolematrix_test.mjs) bleibt die
// autoritative Absicherung inkl. echter Navigation; dieser Harness
// erlaubt dieselben Pruefungen dort, wo kein Chromium verfuegbar ist,
// und ist die Grundlage fuer das Regenerieren des Goldens.
//
// Der Stub bildet nur ab, was gema_auth.js beim LADEN anfasst:
// window/document/location/localStorage. Alles Netz-/DOM-Nahe
// (GemaSync, DOMContentLoaded-Handler) bleibt bewusst weg.
import { readFileSync } from 'fs';
import { createContext, runInContext } from 'vm';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function makeLocalStorage(initial = {}) {
  const store = Object.assign(Object.create(null), initial);
  return {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    key: i => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; },
    _store: store
  };
}

/**
 * Laedt gema_auth.js und liefert das GemaAuth-Objekt.
 * @param {object} opts
 *   opts.page      Dateiname der simulierten Seite (Default 'sys_profil.html')
 *   opts.storage   Vorbelegung des localStorage (Roh-Strings)
 *
 * KRITISCH — Default-Seite: der Rollen-Redirect im Init macht ein `return`
 * aus der IIFE, BEVOR w.GemaAuth zugewiesen wird (im Browser egal, dort
 * navigiert location.href sofort weg — im Harness bliebe GemaAuth undefined).
 * 'sys_profil' steht in _KONTO_SEITEN und ist damit vom Redirect ausgenommen:
 * der einzige Kontext, in dem JEDE Rolle die API bekommt.
 */
export function loadAuth(opts = {}) {
  const page = opts.page || 'sys_profil.html';
  const localStorage = makeLocalStorage(opts.storage || {});
  const noop = () => {};
  const el = () => ({
    style: {}, dataset: {}, classList: { add: noop, remove: noop, contains: () => false },
    setAttribute: noop, removeAttribute: noop, getAttribute: () => null,
    appendChild: noop, insertAdjacentElement: noop, insertAdjacentHTML: noop,
    addEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
    remove: noop, focus: noop, click: noop, innerHTML: '', textContent: '', value: ''
  });
  const document = {
    readyState: 'loading',
    addEventListener: noop, removeEventListener: noop,
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: el,
    head: el(), body: el(), documentElement: el()
  };
  const sandbox = {
    console,
    localStorage, sessionStorage: makeLocalStorage(),
    document,
    location: {
      pathname: '/' + page, search: '', hash: '', href: 'http://localhost/' + page,
      origin: 'http://localhost', replace: noop, assign: noop, reload: noop
    },
    navigator: { onLine: true, userAgent: 'node' },
    fetch: () => Promise.reject(new Error('offline im Harness')),
    setTimeout, clearTimeout, setInterval, clearInterval,
    matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    URLSearchParams, Promise, Date, Math, JSON
  };
  // NUR window spiegeln — self/globalThis im VM-Kontext zu ueberschreiben
  // bringt den Kontext durcheinander (gema_auth.js laedt dann still nicht).
  sandbox.window = sandbox;
  createContext(sandbox);
  runInContext(readFileSync(join(ROOT, 'gema_auth.js'), 'utf8'), sandbox, { filename: 'gema_auth.js' });
  return { GemaAuth: sandbox.GemaAuth, sandbox, localStorage };
}

/** Session + Benutzer-Cache fuer eine Rolle setzen (ohne Cloud/Login). */
export function sessionFor(roleIds, extra = {}) {
  const user = Object.assign({
    id: 'u_test', username: 'test@gema.ch', name: 'Test',
    orgId: 'org_test', roleIds: [].concat(roleIds), active: true
  }, extra);
  return {
    gema_session_v1: JSON.stringify({ userId: user.id, token: 'x.y.z', remember: true }),
    gema_users_v1: JSON.stringify([user]),
    gema_orgs_v1: JSON.stringify([{ id: 'org_test', name: 'Testfirma', active: true }])
  };
}

/** Rechte-Kuerzel wie im Golden: 'rwa' | 'rw' | 'r' | '-' */
export function permCode(GemaAuth, key) {
  if (GemaAuth.can('admin', key)) return 'rwa';
  if (GemaAuth.can('write', key)) return 'rw';
  if (GemaAuth.can('read', key)) return 'r';
  return '-';
}

/** Volle Rollen×Modul-Matrix (Reihenfolge kanonisch sortiert). */
export function buildMatrix() {
  const base = loadAuth();
  const modKeys = base.GemaAuth.getModules().map(m => m.key).sort();
  const roleIds = base.GemaAuth.getRoles().map(r => r.id).sort();
  const matrix = {};
  for (const rid of roleIds) {
    const { GemaAuth } = loadAuth({ storage: sessionFor(rid) });
    const row = {};
    for (const k of modKeys) row[k] = permCode(GemaAuth, k);
    matrix[rid] = row;
  }
  return { matrix, modKeys, roleIds };
}
