// Node-Test der DOM-freien Immobilien-Engine (iv_immobilien.html /*ENGINE-START*/-Block)
// Aufruf: node scripts/immobilien_engine_test.mjs
import fs from 'fs';

const src = fs.readFileSync(new URL('../iv_immobilien.html', import.meta.url), 'utf8');
const m = src.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!m) { console.error('ENGINE-Block nicht gefunden'); process.exit(1); }
const E = new Function(m[1] + `
  return {IV_AUF_KATEGORIEN,IV_AUF_STATUS,ivAufNext,ivNextNr,ivScopeAuftraege,ivMvAktiv,
    ivMvAuslaufend,ivLeerQuote,ivKpis,ivAddDays,ivSpuelDue};
`)();

let n = 0, fail = 0;
function t(name, cond) {
  n++;
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.error('  ✗ ' + name); }
}
function eq(name, a, b) {
  t(name + ' (' + JSON.stringify(a) + ' == ' + JSON.stringify(b) + ')', JSON.stringify(a) === JSON.stringify(b));
}

console.log('— Status-Maschine —');
eq('offen + beauftragen', E.ivAufNext('offen', 'beauftragen'), 'beauftragt');
eq('beauftragt + annehmen', E.ivAufNext('beauftragt', 'annehmen'), 'in_arbeit');
eq('in_arbeit + erledigen', E.ivAufNext('in_arbeit', 'erledigen'), 'erledigt');
eq('beauftragt + erledigen (direkt)', E.ivAufNext('beauftragt', 'erledigen'), 'erledigt');
eq('beauftragt + ablehnen', E.ivAufNext('beauftragt', 'ablehnen'), 'abgelehnt');
eq('abgelehnt + zurueckziehen', E.ivAufNext('abgelehnt', 'zurueckziehen'), 'offen');
eq('beauftragt + zurueckziehen', E.ivAufNext('beauftragt', 'zurueckziehen'), 'offen');
eq('UNGÜLTIG: offen + annehmen', E.ivAufNext('offen', 'annehmen'), null);
eq('UNGÜLTIG: erledigt + erledigen', E.ivAufNext('erledigt', 'erledigen'), null);
eq('UNGÜLTIG: in_arbeit + ablehnen', E.ivAufNext('in_arbeit', 'ablehnen'), null);
eq('UNGÜLTIG: erledigt + zurueckziehen', E.ivAufNext('erledigt', 'zurueckziehen'), null);
eq('UNGÜLTIG: unbekannte Aktion', E.ivAufNext('offen', 'quatsch'), null);

console.log('— Nummernkreis —');
eq('erster Auftrag', E.ivNextNr([], 'org1', 2026), 'HW-2026-001');
eq('Fortlauf max+1', E.ivNextNr([{ orgId: 'org1', nr: 'HW-2026-007' }, { orgId: 'org1', nr: 'HW-2026-003' }], 'org1', 2026), 'HW-2026-008');
eq('fremde Org zählt nicht', E.ivNextNr([{ orgId: 'org2', nr: 'HW-2026-009' }], 'org1', 2026), 'HW-2026-001');
eq('anderes Jahr zählt nicht', E.ivNextNr([{ orgId: 'org1', nr: 'HW-2025-044' }], 'org1', 2026), 'HW-2026-001');
eq('kaputte Nr ignoriert', E.ivNextNr([{ orgId: 'org1', nr: 'XX-1' }, null], 'org1', 2026), 'HW-2026-001');

console.log('— Auftrag-Scoping (Verwalter-Org vs. Handwerker) —');
const verwalter = { id: 'u_v', orgId: 'org_verw', profile: { email: 'v@verw.ch' }, username: 'v@verw.ch' };
const handwerker = { id: 'u_h', orgId: 'org_hand', profile: { email: 'hans@hand.ch' }, username: 'hans@hand.ch' };
const aufs = [
  { id: 'a1', orgId: 'org_verw', handwerker: { typ: 'gema', userId: 'u_h', email: 'hans@hand.ch' } },
  { id: 'a2', orgId: 'org_verw', handwerker: { typ: 'extern', userId: '', email: '' } },
  { id: 'a3', orgId: 'org_fremd', handwerker: { typ: 'gema', userId: 'u_h', email: '' } },
  { id: 'a4', orgId: 'org_fremd', handwerker: { typ: 'extern', userId: '', email: 'HANS@hand.ch' } },
  { id: 'a5', orgId: 'org_fremd', handwerker: { typ: 'gema', userId: 'u_x', email: 'x@x.ch' } },
  null
];
const sv = E.ivScopeAuftraege(aufs, verwalter);
eq('Verwalter sieht Org-Aufträge', sv.org.map(a => a.id), ['a1', 'a2']);
eq('Verwalter hat keine zugewiesenen', sv.meine.length, 0);
const sh = E.ivScopeAuftraege(aufs, handwerker);
eq('Handwerker: org-eigene leer', sh.org.length, 0);
eq('Handwerker: userId-Match + E-Mail-Match case-insensitive', sh.meine.map(a => a.id), ['a1', 'a3', 'a4']);
eq('null-User crasht nicht', E.ivScopeAuftraege(aufs, null).meine.length, 0);

console.log('— Mietverhältnis —');
eq('aktiv (unbefristet)', E.ivMvAktiv({ status: 'aktiv', beginn: '2026-01-01', ende: '' }, '2026-07-12'), true);
eq('aktiv am letzten Tag', E.ivMvAktiv({ status: 'aktiv', beginn: '2026-01-01', ende: '2026-07-12' }, '2026-07-12'), true);
eq('abgelaufen', E.ivMvAktiv({ status: 'aktiv', beginn: '2026-01-01', ende: '2026-07-11' }, '2026-07-12'), false);
eq('noch nicht begonnen', E.ivMvAktiv({ status: 'aktiv', beginn: '2026-08-01', ende: '' }, '2026-07-12'), false);
eq('status beendet', E.ivMvAktiv({ status: 'beendet', beginn: '2026-01-01', ende: '' }, '2026-07-12'), false);
eq('auslaufend in 30 Tagen (90er-Fenster)', E.ivMvAuslaufend({ status: 'aktiv', beginn: '2026-01-01', ende: '2026-08-11' }, '2026-07-12', 90), true);
eq('Ende erst in 120 Tagen → nicht auslaufend', E.ivMvAuslaufend({ status: 'aktiv', beginn: '2026-01-01', ende: '2026-11-09' }, '2026-07-12', 90), false);
eq('unbefristet → nie auslaufend', E.ivMvAuslaufend({ status: 'aktiv', beginn: '2026-01-01', ende: '' }, '2026-07-12', 90), false);

console.log('— KPIs / Leerstand —');
eq('Leerquote 0 bei 0 Wohnungen', E.ivLeerQuote([]), 0);
eq('Leerquote 1/3 = 33.3 %', E.ivLeerQuote([{ status: 'leer' }, { status: 'vermietet' }, { status: 'vermietet' }]), 33.3);
const kp = E.ivKpis(
  [{ id: 'lg1' }],
  [{ status: 'leer' }, { status: 'vermietet' }],
  [
    { status: 'aktiv', beginn: '2026-01-01', ende: '', nettomiete: '1650', nebenkosten: '220' },
    { status: 'aktiv', beginn: '2026-01-01', ende: '2026-03-31', nettomiete: '999', nebenkosten: '99' } // abgelaufen
  ],
  [{ status: 'offen' }, { status: 'in_arbeit' }, { status: 'erledigt' }, { status: 'abgelehnt' }],
  '2026-07-12'
);
eq('KPI Wohnungen', kp.wohnungen, 2);
eq('KPI Leerstand', kp.leer, 1);
eq('KPI Mietzins-Soll nur aktive MV (netto+NK)', kp.mietzinsSoll, 1870);
eq('KPI offene Aufträge (offen+beauftragt+in_arbeit)', kp.auftraegeOffen, 2);

console.log('— Datum / Spülfälligkeit —');
eq('ivAddDays Monatswechsel', E.ivAddDays('2026-07-28', 7), '2026-08-04');
eq('ivAddDays Jahreswechsel', E.ivAddDays('2026-12-30', 3), '2027-01-02');
eq('beendetes Spülobjekt → null', E.ivSpuelDue({ aktiv: false, intervalTage: 7 }, [], '2026-07-12'), null);
const due1 = E.ivSpuelDue({ aktiv: true, intervalTage: 7 }, [{ letzteSpuelung: '' }, { letzteSpuelung: '2026-07-10' }], '2026-07-12');
eq('nie gespült = sofort fällig (1 von 2)', due1.faellig, 1);
eq('nächste = heute (nie gespült dominiert)', due1.naechste, '2026-07-12');
const due2 = E.ivSpuelDue({ aktiv: true, intervalTage: 7 }, [{ letzteSpuelung: '2026-07-01' }], '2026-07-12');
eq('überfällig nach Intervall', due2.faellig, 1);
eq('nächste = letzte + Intervall', due2.naechste, '2026-07-08');
const due3 = E.ivSpuelDue({ aktiv: true, intervalTage: 7 }, [{ letzteSpuelung: '2026-07-10' }], '2026-07-12');
eq('frisch gespült → 0 fällig', due3.faellig, 0);

console.log('');
console.log(n - fail + '/' + n + ' Tests grün' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
