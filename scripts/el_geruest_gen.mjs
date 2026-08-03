/* ════════════════════════════════════════════════════════════════════════
   GEMA — Generator für el_-Modul-Gerüste
   ════════════════════════════════════════════════════════════════════════
   Erzeugt ein leeres, aber vollständig GEMA-konformes Berechnungsmodul:
   Nav nach Kanon (Logo 1:1 aus der Referenzseite — nav_uniform_test verlangt
   GENAU eine Logo-Variante), PWA-Metas, Projekt-Leiste mit Objekt-Bezug,
   AutoSave, Fold-Karten im Schrittprinzip Eingabe → Berechnung → Ergebnis,
   ENGINE-Block und Feedback-Init.

   AUFRUF
     node scripts/el_geruest_gen.mjs                  # alle geplanten Module
     node scripts/el_geruest_gen.mjs el_kurzschluss   # nur eines
     node scripts/el_geruest_gen.mjs --force          # bestehende überschreiben

   Bestehende Dateien werden ohne --force NIE überschrieben (ein bereits
   ausgebautes Modul darf der Generator nicht platt machen).

   NEUES MODUL: Eintrag in MODULE ergänzen, Generator laufen lassen — DANN
   die geteilten Dateien nachführen (gema_auth, index.html, el_index.html,
   sw.js, gema_recent, sys_workspace, workspace_module_test, Rollen-Golden).
   Siehe CLAUDE.md › «Elektroberechnungen (el_)».
   ════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Modul-Katalog. praefix = eindeutiger JS-Namensraum (verhindert Kollisionen,
   wenn mehrere Module parallel entwickelt werden). */
const MODULE = [
  { datei:'el_spannungsfall',  praefix:'sf', icon:'⚡',
    titel:'Spannungsfall & Verlustleistung', kurz:'Spannungsfall',
    norm:'NIN / SN EN 60364-5-52',
    sub:'Spannungsfall, Verlustleistung und Kosten je Leitung — Cu/Al, ein- und dreiphasig' },
  { datei:'el_belastbarkeit',  praefix:'bl', icon:'🔌',
    titel:'Strombelastbarkeit & Kabelwahl', kurz:'Belastbarkeit',
    norm:'NIN 5.2.3 / SN EN 60364-5-52',
    sub:'Zulässige Dauerbelastung nach Verlegeart, Häufung und Umgebungstemperatur' },
  { datei:'el_kurzschluss',    praefix:'kz', icon:'🛡️',
    titel:'Kurzschluss & Abschaltbedingung', kurz:'Kurzschluss',
    norm:'NIN 4.1.1 / SN EN 60364-4-41',
    sub:'Schleifenimpedanz, Kurzschlussstrom und Nachweis der Abschaltzeit' },
  { datei:'el_leistungsbedarf',praefix:'lb', icon:'📊',
    titel:'Anschlussleistung & Gleichzeitigkeit', kurz:'Leistungsbedarf',
    norm:'NIN 3.1 / SIA 2056',
    sub:'Installierte Leistung, Gleichzeitigkeitsfaktoren und Bemessungsstrom' },
  { datei:'el_beleuchtung',    praefix:'bt', icon:'💡',
    titel:'Beleuchtungsberechnung', kurz:'Beleuchtung',
    norm:'SN EN 12464-1',
    sub:'Wirkungsgradverfahren — Beleuchtungsstärke, Leuchtenzahl, Anschlussleistung' },
  { datei:'el_potenzialausgleich', praefix:'pa', icon:'🔗',
    titel:'Potenzialausgleich & Schutzleiter', kurz:'Potenzialausgleich',
    norm:'NIN 5.4 / SN EN 60364-5-54',
    sub:'Querschnitte für Schutzleiter, Haupt- und zusätzlichen Potenzialausgleich sowie Funktionserde' },
  { datei:'el_photovoltaik',   praefix:'pv', icon:'☀️',
    titel:'Photovoltaik — Ertrag & Eigenverbrauch', kurz:'Photovoltaik',
    norm:'SN EN 61724 / VSE',
    sub:'Jahresertrag, Eigenverbrauchsanteil und Wirtschaftlichkeit' }
];

/* Logo-SVG 1:1 aus einer bestehenden Seite — NIE von Hand kopieren, sonst
   entsteht eine zweite Logo-Variante und nav_uniform_test schlägt fehl. */
function logoSvg(){
  const ref = readFileSync(join(ROOT, 'sb_druckverlust.html'), 'utf8');
  const m = ref.match(/<div class="g-nav-mark">([\s\S]*?)<\/div>/);
  if(!m) throw new Error('Logo-SVG in sb_druckverlust.html nicht gefunden');
  return m[1];
}

function template(m, logo){
  const P = m.praefix;
  return `<!doctype html>
<html lang="de">
<head>
<script src="gema_sync.js"><\/script>
<script src="gema_auth.js"><\/script>
<script src="gema_recent.js"><\/script>
<meta charset="utf-8"/>
<meta name="theme-color" content="#0f172a"/>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<meta name="mobile-web-app-capable" content="yes"/>
<meta name="apple-mobile-web-app-capable" content="yes"/>
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
<meta name="apple-mobile-web-app-title" content="GEMA"/>
<title>GEMA – ${m.titel}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700;9..40,800;9..40,900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="el_base.css"/>
<style>
/* ── Modul-eigenes CSS ───────────────────────────────────────────────────
   Die gemeinsame Optik kommt aus el_base.css. Hier NUR ergänzen, was dieses
   Modul zusätzlich braucht (eigene Tabellen, Schema-SVG, Spezialzeilen).
   SVG-Schemata: ausschliesslich literale Hex-Farben — var() rastert
   GemaPDF/html2canvas falsch. */
</style>
<script src="gema_db.js"><\/script>
<script src="gema_feedback.js"><\/script><script src="gema_notify.js"><\/script><script src="gema_notify_ui.js"><\/script><script src="gema_chat.js"><\/script>
<script src="gema_objekte_api.js"><\/script>
<script src="gema_pdf.js"><\/script>
<script src="gema_autosave.js"><\/script>
<script src="gema_elektro.js"><\/script>
<script src="gema_dialog.js"><\/script>
<link rel="stylesheet" href="gema_responsive.css"/>
</head>
<body>
<nav class="g-nav">
  <div class="g-nav-inner">
    <a class="g-nav-logo" href="index.html">
      <div class="g-nav-mark">${logo}</div>
    </a>
    <div class="g-nav-bc">
      <a class="bc-cat" href="el_index.html">Elektroberechnungen</a><span class="bc-sep">›</span>
      <span class="bc-cur">${m.kurz}</span>
    </div>
    <div class="g-nav-right">
      <button class="g-nav-btn no-print" onclick="GemaPDF.export({title:'${m.kurz}',color:'#ca8a04'})">📄 PDF</button>
      <button class="g-nav-btn no-print" onclick="window.print()">🖨 Drucken</button>
      <button class="gema-feedback-btn no-print" onclick="GemaFeedback.start()">🔴 Feedback</button>
    </div>
  </div>
</nav>

<div class="pg">

  <div class="gema-hero">
    <div class="gema-hero-in">
      <div class="gema-hero-ic">${m.icon}</div>
      <div>
        <div class="gema-hero-title">${m.titel}</div>
        <div class="gema-hero-norm" title="Berechnungsgrundlage">📖 ${m.norm}</div>
        <div class="gema-hero-sub">${m.sub}</div>
      </div>
    </div>
  </div>

  <!-- Kennzahlen-Leiste: die 2–4 wichtigsten Ergebnisse, live nachgeführt -->
  <div class="sum-bar" id="${P}SumBar">
    <span class="sum-item">Ergebnis <b class="hl" id="${P}_sum1">—</b></span>
    <span class="sum-sep"></span>
    <span class="sum-item">Kontrolle <b id="${P}_sum2">—</b></span>
  </div>

  <!-- PROJEKT-LEISTE — Objektbezug (AutoSave speichert pro Objekt/Phase) -->
  <div class="project-bar">
    <div class="pf"><label>Objekt <a href="pm_objekte.html" title="Neues Objekt anlegen" style="margin-left:6px;margin-right:auto;width:16px;height:16px;border-radius:4px;background:#ca8a04;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:14px;font-weight:400;text-decoration:none!important;line-height:0;flex-shrink:0;padding:0;vertical-align:middle;font-family:Arial,sans-serif">+</a><button class="obj-combo-toggle" id="objComboBtn" onclick="toggleObjektInput()">Freies Objekt</button></label>
      <div class="obj-combo">
        <div class="obj-combo-row" id="objComboSelect">
          <select id="metaObjektDropdown" onchange="onObjektSelect()">
            <option value="">– Objekt wählen –</option>
          </select>
        </div>
        <div class="obj-combo-row" id="objComboManual" style="display:none">
          <input type="text" id="metaProjekt" placeholder="z.B. MFH Musterstrasse 12, Basel"/>
        </div>
      </div>
    </div>
    <div class="pf"><label>Bearbeiter</label><input type="text" id="metaBearbeiter" placeholder="Name"></div>
    <div class="pf"><label>Datum</label><input type="date" id="metaDatum"></div>
  </div>

  <!-- ═══ GERÜST-BANNER — beim Ausbau des Moduls ERSATZLOS ENTFERNEN ═══ -->
  <div class="el-stub" id="${P}Stub">
    <b>Gerüst — die Berechnung fehlt noch.</b><br>
    Aufbau, Registrierung und Persistenz stehen; einzutragen sind die Eingabefelder
    (Karte 1), die Fachlogik im <code>/*ENGINE-START*/</code>-Block und die Ergebnis-Zeilen
    (Karte 3). Alle Elektro-Grunddaten — Leitermaterial, κ bei Betriebstemperatur,
    Querschnittsreihe, Netzsysteme — kommen aus <code>gema_elektro.js</code> und werden
    hier NICHT neu definiert.
  </div>

  <!-- ═══ 1. EINGABE ═══ -->
  <div class="el-card" data-fold="eingabe">
    <div class="el-card-hd" onclick="${P}Fold(this)">
      <span class="el-cx">▸</span>
      <span class="el-secnum">1</span>
      <span class="el-card-tt">Eingabe</span>
      <span class="el-card-sub">Angaben zur Anlage</span>
    </div>
    <div class="el-card-bd">
      <div class="el-grid">
        <!-- MUSTER — freistehende Zahlenfelder IMMER type="text" +
             inputmode="decimal" + fixLeadingZero + angeschlossene Einheit.
             NIE type="number". -->
        <div class="fg">
          <label>Beispielwert</label>
          <div class="g-inp-group">
            <input class="g-inp" id="${P}_beispiel" type="text" inputmode="decimal"
                   value="16" placeholder="0.0" onblur="fixLeadingZero(this)" oninput="${P}Recalc()"/>
            <span class="g-inp-unit">A</span>
          </div>
          <div class="fg-hint">Kurzer Hinweis, woher der Wert kommt.</div>
        </div>
        <div class="fg">
          <label>Leitermaterial</label>
          <select id="${P}_material" onchange="${P}Recalc()"></select>
          <div class="fg-hint" id="${P}_matHint"></div>
        </div>
        <div class="fg">
          <label>Betriebstemperatur Leiter</label>
          <select id="${P}_temp" onchange="${P}Recalc()"></select>
          <div class="fg-hint">κ sinkt mit der Temperatur — 20 °C rechnet zu günstig.</div>
        </div>
      </div>
    </div>
  </div>

  <!-- ═══ 2. BERECHNUNG ═══ -->
  <div class="el-card" data-fold="berechnung">
    <div class="el-card-hd" onclick="${P}Fold(this)">
      <span class="el-cx">▸</span>
      <span class="el-secnum">2</span>
      <span class="el-card-tt">Berechnung</span>
      <span class="el-card-sub">Zwischenwerte</span>
    </div>
    <div class="el-card-bd">
      <div class="el-res">
        <div class="el-res-lbl">Leitfähigkeit bei Betriebstemperatur
          <span class="frml">κ(t) = κ₂₀ / (1 + α · (t − 20))</span></div>
        <div class="el-res-val" id="${P}_kappa">—</div>
      </div>
      <div class="frml-block" id="${P}_legende">
        Formel-Legende — die Chips müssen dem Code entsprechen.
      </div>
    </div>
  </div>

  <!-- ═══ 3. ERGEBNIS ═══ -->
  <div class="el-card" data-fold="ergebnis">
    <div class="el-card-hd" onclick="${P}Fold(this)">
      <span class="el-cx">▸</span>
      <span class="el-secnum">3</span>
      <span class="el-card-tt">Ergebnis</span>
      <span class="el-card-sub">Bewertung</span>
    </div>
    <div class="el-card-bd">
      <div class="el-res">
        <div class="el-res-lbl">Hauptergebnis</div>
        <div class="el-res-val hl" id="${P}_hauptwert">—</div>
      </div>
      <div class="el-status ok" id="${P}_status" style="margin-top:12px">
        Noch keine Berechnung.
      </div>
    </div>
  </div>

</div>

<script>
/*ENGINE-START*/
/* ── Rechenkern — DOM-FREI ───────────────────────────────────────────────
   Hier gehört die gesamte Fachlogik hinein: keine getElementById, kein
   innerHTML. Nur so lässt sich der Kern in Node gegen unabhängig gerechnete
   Werte testen (scripts/${m.datei.replace('el_','')}_engine_test.mjs).

   Grunddaten kommen aus GemaElektro — Material, κ(t), Querschnittsreihe,
   Netzsysteme und Zahlen-Helfer NIE hier duplizieren.

   Rückgabe: ein Objekt mit allen Werten, die die Oberfläche anzeigt.
   Grenzwert-Überschreitungen als Feld melden (nie still abschneiden). */
function ${P}Calc(inp){
  var E = (typeof GemaElektro!=='undefined') ? GemaElektro : null;
  var kappa = E ? E.elKappa(inp.material, inp.temp) : 56;

  // TODO: Fachlogik dieses Moduls
  return {
    kappa: kappa,
    hauptwert: null,
    status: 'leer'   // 'ok' | 'warn' | 'err' | 'leer'
  };
}
/*ENGINE-END*/

/* ── Oberfläche ─────────────────────────────────────────────────────────── */
function fixLeadingZero(el){
  var v = el.value.trim();
  if(v === '') return;
  v = v.replace(',', '.');
  if(/^\\./.test(v)) v = '0' + v;
  if(/^-\\./.test(v)) v = '-0' + v.slice(1);
  var n = parseFloat(v);
  el.value = isFinite(n) ? String(n) : '';
}

/* Fold: Zustand pro Gerät, NIE im AutoSave-Snapshot (Geräte-UI). */
var ${P}FOLD_KEY = 'gema_el_fold_v1';
function ${P}FoldState(){
  try{ return JSON.parse(localStorage.getItem(${P}FOLD_KEY) || '{}'); }catch(e){ return {}; }
}
function ${P}Fold(hd){
  var card = hd.closest('.el-card');
  if(!card) return;
  card.classList.toggle('zu');
  var st = ${P}FoldState();
  st['${m.datei}.' + (card.getAttribute('data-fold')||'')] = card.classList.contains('zu');
  try{ localStorage.setItem(${P}FOLD_KEY, JSON.stringify(st)); }catch(e){}
}
function ${P}FoldInit(){
  var st = ${P}FoldState();
  document.querySelectorAll('.el-card[data-fold]').forEach(function(c){
    if(st['${m.datei}.' + c.getAttribute('data-fold')]) c.classList.add('zu');
  });
}

function ${P}FillSelects(){
  var E = (typeof GemaElektro!=='undefined') ? GemaElektro : null;
  if(!E) return;
  var mat = document.getElementById('${P}_material');
  if(mat && !mat.options.length){
    mat.innerHTML = E.EL_MATERIAL.map(function(m){
      return '<option value="'+m.id+'">'+m.name+' — κ₂₀ '+m.kappa20+' m/(Ω·mm²)</option>';
    }).join('');
  }
  var tmp = document.getElementById('${P}_temp');
  if(tmp && !tmp.options.length){
    tmp.innerHTML = E.EL_TEMP_STUFEN.map(function(s){
      return '<option value="'+s.t+'"'+(s.t===70?' selected':'')+'>'+s.label+'</option>';
    }).join('');
  }
}

function ${P}Read(){
  var E = (typeof GemaElektro!=='undefined') ? GemaElektro : null;
  var num = E ? E.elNum : function(v){ return parseFloat(String(v).replace(',','.')) || 0; };
  var g = function(id){ var e = document.getElementById(id); return e ? e.value : ''; };
  return {
    beispiel: num(g('${P}_beispiel')),
    material: g('${P}_material') || 'cu',
    temp:     num(g('${P}_temp')) || 20
  };
}

function ${P}Recalc(){
  var E = (typeof GemaElektro!=='undefined') ? GemaElektro : null;
  var fmt = E ? E.elFmt : function(v,d){ return Number(v).toFixed(d===undefined?2:d); };
  var r;
  try{ r = ${P}Calc(${P}Read()); }catch(e){ console.warn('${P}Calc:', e); return; }

  var set = function(id, txt){ var el = document.getElementById(id); if(el) el.textContent = txt; };
  set('${P}_kappa', fmt(r.kappa, 2) + ' m/(Ω·mm²)');
  set('${P}_hauptwert', r.hauptwert === null ? '—' : fmt(r.hauptwert, 2));

  var st = document.getElementById('${P}_status');
  if(st){
    st.className = 'el-status ' + (r.status === 'leer' ? 'ok' : r.status);
    st.textContent = r.status === 'leer'
      ? 'Noch keine Berechnung — die Fachlogik fehlt.'
      : 'Ergebnis liegt vor.';
  }
  set('${P}_sum1', r.hauptwert === null ? '—' : fmt(r.hauptwert, 2));
  set('${P}_sum2', fmt(r.kappa, 1));
}

/* ── Snapshot-Fallback (KRITISCH) ────────────────────────────────────────
   GemaAutoSave stellt beim Seitenstart NUR wieder her, wenn ein Objekt
   gewählt ist («Initial load for current object»). Wer ohne Projektbezug
   rechnet — freies Objekt, schnelle Kontrollrechnung — verlöre seine
   Eingaben sonst bei jedem Reload, obwohl sie gespeichert sind.
   Darum lesen wir den Snapshot direkt aus dem Speicher nach, solange der
   Benutzer nichts angefasst hat (Muster glSnapshotLoad in sb_grundleitungen).
   \`e.isTrusted\` unterscheidet echte Eingaben von programmatischen. */
var _${P}Touched = false;
document.addEventListener('input',  function(e){ if(e.isTrusted) _${P}Touched = true; }, true);
document.addEventListener('change', function(e){ if(e.isTrusted) _${P}Touched = true; }, true);

function ${P}SnapshotKey(){
  var sel = document.getElementById('metaObjektDropdown');
  var basis = 'gema_${m.datei.replace('el_','')}';
  if(!sel || !sel.value) return basis;
  try{
    if(typeof GemaObjekte !== 'undefined' && GemaObjekte.storageKey) return GemaObjekte.storageKey(basis);
  }catch(e){}
  return basis + '__' + sel.value;
}

function ${P}SnapshotLoad(){
  if(_${P}Touched) return;
  var daten;
  try{ daten = JSON.parse(localStorage.getItem(${P}SnapshotKey()) || 'null'); }catch(e){ return; }
  if(!daten) return;
  var gesetzt = false;
  Object.keys(daten).forEach(function(id){
    if(id.charAt(0) === '_') return;              // _ts u.ä. sind Metadaten
    if(id.indexOf('${P}_') !== 0) return;         // nur die Felder dieses Moduls
    var el = document.getElementById(id);
    if(!el || el.value === daten[id]) return;
    el.value = daten[id];
    gesetzt = true;
  });
  if(gesetzt) ${P}Recalc();
}

document.addEventListener('DOMContentLoaded', function(){
  ${P}FoldInit();
  ${P}FillSelects();
  ${P}Recalc();
  /* Gestaffelt, weil der Objekt-Bezug und der Cloud-Pull später eintreffen. */
  setTimeout(${P}SnapshotLoad, 700);
  setTimeout(${P}SnapshotLoad, 1800);
  setTimeout(${P}SnapshotLoad, 3500);
});
/* AutoSave-Restore setzt Werte programmatisch — danach neu rechnen. */
window.addEventListener('gema-autosave-restored', function(){ ${P}FillSelects(); ${P}Recalc(); });
window.addEventListener('gema-objekte-loaded', function(){ setTimeout(${P}SnapshotLoad, 300); });
<\/script>

<script>
// ── PROJECT META (auto-save) ──
(function(){
  var MK='gema_meta_'+location.pathname.split('/').pop().replace('.html','');
  function saveMeta(){try{var oid=document.getElementById('metaObjektDropdown')?.value||'';localStorage.setItem(MK,JSON.stringify({p:document.getElementById('metaProjekt')?.value||'',b:document.getElementById('metaBearbeiter')?.value||'',d:document.getElementById('metaDatum')?.value||'',oid:oid}));}catch(e){}}
  function loadMeta(){try{var d=JSON.parse(localStorage.getItem(MK));if(d){if(document.getElementById('metaProjekt'))document.getElementById('metaProjekt').value=d.p||'';if(document.getElementById('metaBearbeiter'))document.getElementById('metaBearbeiter').value=d.b||'';if(document.getElementById('metaDatum'))document.getElementById('metaDatum').value=d.d||'';if(d.oid&&document.getElementById('metaObjektDropdown')){document.getElementById('metaObjektDropdown').value=d.oid;_prevObjektId=d.oid;}}}catch(e){}if(!document.getElementById('metaDatum')?.value){var el=document.getElementById('metaDatum');if(el)el.value=new Date().toISOString().slice(0,10);}}
  var _prevObjektId='';
  function _escHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function populateObjektDropdown(){
    if(typeof GemaObjekte==='undefined') return;
    var sel=document.getElementById('metaObjektDropdown');
    if(!sel) return;
    var objs=GemaObjekte.getAll();
    var activeId=GemaObjekte.getActiveId();
    sel.innerHTML='<option value="">\\u2013 Objekt w\\u00e4hlen \\u2013</option>'+
      objs.map(function(o){return '<option value="'+o.id+'"'+(o.id===activeId?' selected':'')+'>'+
        _escHtml(GemaObjekte.displayName(o))+'</option>';}).join('');
    var savedOid=_prevObjektId;
    if(savedOid && objs.find(function(o){return o.id===savedOid;})){
      sel.value=savedOid;
    } else if(activeId && !document.getElementById('metaProjekt').value){
      sel.value=activeId;_prevObjektId=activeId;onObjektSelect();
    }
  }
  function onObjektSelect(){
    var sel=document.getElementById('metaObjektDropdown');
    var inp=document.getElementById('metaProjekt');
    if(!sel||!inp) return;
    if(sel.value && typeof GemaObjekte!=='undefined'){
      var o=GemaObjekte.getAll().find(function(x){return x.id===sel.value;});
      if(o){var parts=[o.name];if(o.strasse)parts.push(o.strasse);if(o.plz||o.ort)parts.push([o.plz,o.ort].filter(Boolean).join(' '));inp.value=parts.join(', ');}
    } else { inp.value=''; }
    _prevObjektId=sel.value;saveMeta();
  }
  function toggleObjektInput(forceManual){
    var isManual=typeof forceManual==='boolean'?forceManual:document.getElementById('objComboManual').style.display==='none';
    document.getElementById('objComboSelect').style.display=isManual?'none':'flex';
    document.getElementById('objComboManual').style.display=isManual?'flex':'none';
    document.getElementById('objComboBtn').textContent=isManual?'Stammdaten':'Freies Objekt';
    if(!isManual) populateObjektDropdown();
  }
  window.onObjektSelect=onObjektSelect;
  window.toggleObjektInput=toggleObjektInput;
  window.populateObjektDropdown=populateObjektDropdown;
  document.addEventListener('DOMContentLoaded',function(){loadMeta();populateObjektDropdown();if(typeof GemaAutoSave!=='undefined') GemaAutoSave.init('${m.datei.replace('el_','')}');});
  window.addEventListener('gema-objekte-loaded',function(){populateObjektDropdown();if(typeof GemaAutoSave!=='undefined') GemaAutoSave.init('${m.datei.replace('el_','')}');});
  ['metaProjekt','metaBearbeiter','metaDatum'].forEach(function(id){var el=document.getElementById(id);if(el)el.addEventListener('input',saveMeta);});
})();<\/script>
<script>
document.addEventListener('DOMContentLoaded', function(){GemaFeedback.init('${m.datei.replace('el_','')}', '${m.titel}');});
<\/script>
<script src="gema_scroll.js"><\/script>
<script src="gema_mobile_menu.js"><\/script>
</body></html>
`;
}

/* ── Lauf ──────────────────────────────────────────────────────────────── */
const args = process.argv.slice(2);
const force = args.includes('--force');
const nur = args.filter(a => !a.startsWith('--'));
const logo = logoSvg();
let neu = 0, sprung = 0;

for(const m of MODULE){
  if(nur.length && !nur.includes(m.datei)) continue;
  const pfad = join(ROOT, m.datei + '.html');
  if(existsSync(pfad) && !force){
    console.log('  übersprungen (existiert): ' + m.datei + '.html');
    sprung++; continue;
  }
  writeFileSync(pfad, template(m, logo), 'utf8');
  console.log('  erzeugt: ' + m.datei + '.html  (Präfix ' + m.praefix + ')');
  neu++;
}
console.log('\n' + neu + ' erzeugt, ' + sprung + ' übersprungen.');
if(neu) console.log('Nicht vergessen: geteilte Dateien nachführen — siehe CLAUDE.md › Elektroberechnungen (el_).');
