// Node-Test der DOM-freien Immobilien-Engine (iv_immobilien.html /*ENGINE-START*/-Block)
// Aufruf: node scripts/immobilien_engine_test.mjs
import fs from 'fs';

const src = fs.readFileSync(new URL('../iv_immobilien.html', import.meta.url), 'utf8');
const m = src.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!m) { console.error('ENGINE-Block nicht gefunden'); process.exit(1); }
const E = new Function(m[1] + `
  return {IV_AUF_KATEGORIEN,IV_AUF_STATUS,ivAufNext,ivNextNr,ivScopeAuftraege,ivMvAktiv,
    ivMvAuslaufend,ivLeerQuote,ivKpis,ivAddDays,ivSpuelDue,
    ivRound5,ivTageImMonat,ivUeberlappTage,ivSollZeilen,ivZahlId,ivNkAbrechnung,ivAufKostenJahr};
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

console.log('— Rundung / Kalender —');
eq('ivRound5 rundet auf 0.05', E.ivRound5(123.456), 123.45);
eq('ivRound5 aufwärts', E.ivRound5(123.478), 123.5);
eq('ivTageImMonat Feb 2026', E.ivTageImMonat('2026-02'), 28);
eq('ivTageImMonat Feb 2028 (Schaltjahr)', E.ivTageImMonat('2028-02'), 29);
eq('ivTageImMonat Juli', E.ivTageImMonat('2026-07'), 31);
eq('Überlappung voll', E.ivUeberlappTage('2026-07-01', '2026-07-31', '2026-07-01', '2026-07-31'), 31);
eq('Überlappung Teil (Einzug 15.)', E.ivUeberlappTage('2026-07-15', '', '2026-07-01', '2026-07-31'), 17);
eq('Überlappung keine', E.ivUeberlappTage('2026-08-01', '', '2026-07-01', '2026-07-31'), 0);
eq('Überlappung offenes Ende + Jahr', E.ivUeberlappTage('2026-03-01', '', '2026-01-01', '2026-12-31'), 306);

console.log('— Mietzins-Soll (pro-rata) —');
const mvsGeld = [
  { id: 'mv1', wohnungId: 'w1', mieter: 'Ganz', beginn: '2026-01-01', ende: '', nettomiete: '1650', nebenkosten: '220', status: 'aktiv' },
  { id: 'mv2', wohnungId: 'w2', mieter: 'Einzug15', beginn: '2026-07-15', ende: '', nettomiete: '1000', nebenkosten: '240', status: 'aktiv' },
  { id: 'mv3', wohnungId: 'w3', mieter: 'Vorbei', beginn: '2025-01-01', ende: '2026-06-30', nettomiete: '900', nebenkosten: '100', status: 'beendet' }
];
const sz = E.ivSollZeilen(mvsGeld, '2026-07');
eq('2 Soll-Zeilen im Juli (beendetes MV zählt nicht)', sz.length, 2);
eq('voller Monat = voller Betrag', sz.find(z => z.mvId === 'mv1').soll, 1870);
eq('Einzug am 15. → 17/31 Tage pro-rata gerundet 0.05', sz.find(z => z.mvId === 'mv2').soll, 680);
const szJuni = E.ivSollZeilen(mvsGeld, '2026-06');
eq('Juni: beendetes MV hat noch volles Soll', szJuni.find(z => z.mvId === 'mv3').soll, 1000);
eq('ivZahlId deterministisch', E.ivZahlId('mv1', '2026-07'), 'z_mv1_2026-07');

console.log('— NK-Jahresabrechnung —');
const whgsNk = [
  { id: 'w1', bez: 'EG', flaecheM2: '100' },
  { id: 'w2', bez: 'OG', flaecheM2: '50' }
];
const mvsNk = [
  { id: 'a', wohnungId: 'w1', mieter: 'Alt', beginn: '2020-01-01', ende: '2025-06-30', nebenkosten: '200' },
  { id: 'b', wohnungId: 'w1', mieter: 'Neu', beginn: '2025-07-01', ende: '', nebenkosten: '200' },
  { id: 'c', wohnungId: 'w2', mieter: 'Halb', beginn: '2025-01-01', ende: '2025-06-30', nebenkosten: '100' }
];
const nk = { jahr: 2025, schluessel: 'flaeche', positionen: [{ bez: 'Heizung', betrag: '6000' }, { bez: 'Hauswart', betrag: '3000' }] };
const erg = E.ivNkAbrechnung(nk, whgsNk, mvsNk);
eq('Total', erg.total, 9000);
eq('Jahrestage 2025', erg.jahresTage, 365);
const w1 = erg.rows.find(r => r.whgId === 'w1');
const w2 = erg.rows.find(r => r.whgId === 'w2');
eq('Flächenschlüssel: w1 = 2/3', w1.anteil, 6000);
eq('w1: Mieterwechsel → 2 Zeilen, keine Leertage', [w1.mieterZeilen.length, w1.leerTage], [2, 0]);
eq('w1/Alt: 181 Tage Anteil', w1.mieterZeilen.find(z => z.mvId === 'a').kostenAnteil, E.ivRound5(6000 * 181 / 365));
eq('w1/Alt: Akonto 200×12×181/365', w1.mieterZeilen.find(z => z.mvId === 'a').akonto, E.ivRound5(200 * 12 * 181 / 365));
eq('w2: halbes Jahr leer wird ausgewiesen', w2.leerTage, 184);
eq('w2: Leerkosten = Anteil×184/365', w2.leerKosten, E.ivRound5(3000 * 184 / 365));
t('Saldo = Anteil − Akonto', w1.mieterZeilen.every(z => z.saldo === E.ivRound5(z.kostenAnteil - z.akonto)));
const ergGleich = E.ivNkAbrechnung({ jahr: 2025, schluessel: 'gleich', positionen: [{ bez: 'X', betrag: '1000' }] }, whgsNk, []);
eq('Schlüssel «gleich»: 500/500', ergGleich.rows.map(r => r.anteil), [500, 500]);

console.log('— Handwerker-Kosten fürs NK-Jahr —');
const aufsK = [
  { id: 'k1', liegenschaftId: 'lg1', status: 'erledigt', erledigtAm: '2025-03-01T10:00:00Z', kosten: { betrag: 380 } },
  { id: 'k2', liegenschaftId: 'lg1', status: 'erledigt', erledigtAm: '2026-01-05T10:00:00Z', kosten: { betrag: 100 } },
  { id: 'k3', liegenschaftId: 'lg1', status: 'in_arbeit', kosten: { betrag: 50 } },
  { id: 'k4', liegenschaftId: 'lg2', status: 'erledigt', erledigtAm: '2025-05-01T10:00:00Z', kosten: { betrag: 70 } },
  { id: 'k5', liegenschaftId: 'lg1', status: 'erledigt', erledigtAm: '2025-08-01T10:00:00Z' }
];
eq('nur erledigte MIT Kosten im Jahr+Liegenschaft', E.ivAufKostenJahr(aufsK, 'lg1', 2025).map(a => a.id), ['k1']);

console.log('');
console.log(n - fail + '/' + n + ' Tests grün' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
