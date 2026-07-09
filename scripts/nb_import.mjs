#!/usr/bin/env node
/*
 * nb_import.mjs — B04-Gitterpunkte (NDJSON.gz) → Supabase nb_gitterpunkt
 *
 * Lädt die von scripts/nb_extract.py erzeugte Datei (ein Gitterpunkt pro Zeile)
 * per PostgREST-REST in Batches in Supabase. Legt zuerst den Datensatz-Record
 * (nb_datensatz) an und schaltet ihn am Ende aktiv (alle anderen inaktiv).
 *
 * VORAUSSETZUNG: supabase/gema_regenwasser_v1.sql wurde im Supabase-SQL-Editor
 * ausgeführt (Tabellen/Trigger/RPC vorhanden).
 *
 * Nutzung (Node ≥ 18):
 *   SUPABASE_SERVICE_KEY=eyJ... node scripts/nb_import.mjs nb_b04_v3.ndjson.gz
 *   # optional: SUPABASE_URL=... (Default = GEMA-Projekt)
 *
 * Der Service-Key umgeht RLS (Schreiben ist nur darüber erlaubt). Er darf NICHT
 * ins Frontend/Repo — nur lokal als Umgebungsvariable setzen.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

const SB_URL = (process.env.SUPABASE_URL || 'https://fjhbqjvaygvhievjgdtm.supabase.co').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY || '';
const FILE = process.argv[2] || 'nb_b04_v3.ndjson.gz';
const BATCH = 1000;

const DATENSATZ = {
  id: 'MCH_B04_v3.0',
  quelle: 'MeteoSchweiz',
  bezeichnung: 'Extreme Punktniederschläge (HADES B4)',
  version: 'v3.0',
  veroeffentlicht: '2025-09-17',
  download_url: 'https://www.meteoschweiz.admin.ch/klima/klima-der-schweiz/rekorde-und-extreme/extremwertanalysen.html',
  lizenz: 'MeteoSchweiz OpenData — freie Weiterverwendung mit Quellenangabe «Quelle: MeteoSchweiz».',
  aktiv: false
};

if (!KEY) { console.error('FEHLER: SUPABASE_SERVICE_KEY nicht gesetzt.'); process.exit(1); }
if (!fs.existsSync(FILE)) { console.error('FEHLER: Datei nicht gefunden: ' + FILE); process.exit(1); }

function hdr(extra) {
  return Object.assign({ apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, extra || {});
}
async function sb(path, opts) {
  const r = await fetch(SB_URL + '/rest/v1/' + path, opts);
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('HTTP ' + r.status + ' ' + path + ' :: ' + t.slice(0, 300)); }
  return r;
}
async function postBatch(rows, tries = 4) {
  for (let i = 1; ; i++) {
    try { await sb('nb_gitterpunkt', { method: 'POST', headers: hdr({ Prefer: 'return=minimal' }), body: JSON.stringify(rows) }); return; }
    catch (e) { if (i >= tries) throw e; await new Promise(r => setTimeout(r, 1000 * i)); }
  }
}

(async () => {
  console.log('Datensatz anlegen: ' + DATENSATZ.id);
  await sb('nb_datensatz?on_conflict=id', { method: 'POST', headers: hdr({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify([DATENSATZ]) });

  console.log('Lese ' + FILE + ' …');
  const lines = zlib.gunzipSync(fs.readFileSync(FILE)).toString('utf8').split('\n').filter(Boolean);
  console.log(lines.length + ' Gitterpunkte, Batchgröße ' + BATCH);

  let sent = 0, batch = [];
  const flush = async () => { if (!batch.length) return; await postBatch(batch); sent += batch.length; process.stdout.write('\r  importiert: ' + sent + '/' + lines.length); batch = []; };
  for (const ln of lines) {
    let o; try { o = JSON.parse(ln); } catch { continue; }
    batch.push({ datensatz_id: DATENSATZ.id, lon: o.lon, lat: o.lat, x_lv95: o.x, y_lv95: o.y, werte: o.werte, unsicherheit: o.unsicherheit || null });
    if (batch.length >= BATCH) await flush();
  }
  await flush();
  process.stdout.write('\n');

  console.log('Datensatz aktiv schalten (andere inaktiv) …');
  await sb('nb_datensatz?id=neq.' + encodeURIComponent(DATENSATZ.id), { method: 'PATCH', headers: hdr({ Prefer: 'return=minimal' }), body: JSON.stringify({ aktiv: false }) });
  await sb('nb_datensatz?id=eq.' + encodeURIComponent(DATENSATZ.id), { method: 'PATCH', headers: hdr({ Prefer: 'return=minimal' }), body: JSON.stringify({ aktiv: true }) });

  // Sanity-Check: nächster Punkt zu Basel muss < 710 m sein
  try {
    const r = await sb('rpc/nb_naechste_punkte', { method: 'POST', headers: hdr(), body: JSON.stringify({ p_lon: 7.59, p_lat: 47.57, p_limit: 1 }) });
    const pts = await r.json();
    const d = pts && pts[0] ? pts[0].distanz_m : null;
    console.log('Sanity-Check Basel: nächster Punkt ' + (d != null ? Math.round(d) + ' m' : '—') + (d != null && d < 710 ? '  ✓' : '  ⚠ prüfen!'));
  } catch (e) { console.log('Sanity-Check übersprungen: ' + e.message); }

  console.log('Fertig — ' + sent + ' Gitterpunkte importiert, Datensatz ' + DATENSATZ.id + ' aktiv.');
})().catch(e => { console.error('\nIMPORT FEHLGESCHLAGEN: ' + e.message); process.exit(1); });
