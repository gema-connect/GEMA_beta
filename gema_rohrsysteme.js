/* ════════════════════════════════════════════════════════════════════════
   GEMA — Rohrsysteme & Dimensionen (geteilte Wahrheit)
   ════════════════════════════════════════════════════════════════════════
   Der Katalog der Rohrsysteme (Fabrikat, Material, Rauhigkeit k, Dimensionen
   mit Innendurchmesser) lag bis 08/2026 NUR in sb_druckverlust.html. Feedback
   01.08.2026 (Sandro): «Verschiedene Materialien und Dimensionen wählbar —
   Hersteller und Rohrmaterial aus Druckverlust übernehmen» (sb_druckanstieg).
   Damit die Kataloge nie auseinanderlaufen, liegt die Tabelle jetzt hier und
   wird von BEIDEN Modulen gelesen.

   KRITISCH — Sortimente NIE durch Löschen einer Dimension einschränken:
   eine nicht mehr lieferbare Dimension bekommt `legacy:true` und bleibt damit
   für gespeicherte Berechnungen auflösbar (dimAuswahl blendet sie aus, ausser
   die Zeile nutzt sie bereits). Neues Sammel-System: die Einzelsysteme bleiben
   in SYSTEMS mit `hidden:true`.

   window.GemaRohre = {SYSTEMS, MERGED_SYSTEMS, sysById, dimAuswahl, sysAuswahl,
                       dimLabel, alphaFor}
   ════════════════════════════════════════════════════════════════════════ */
(function(){
const SYSTEMS = [
  {id:'mapress',       name:'Geberit Mapress',      material:'Edelstahl', k:0.0015, lieferant:'Geberit AG', status:'verifiziert',
   dims:[{dn:'15x1.0',di:13.0},{dn:'18x1.0',di:16.0},{dn:'22x1.2',di:19.6},{dn:'28x1.2',di:25.6},{dn:'35x1.5',di:32.0},{dn:'42x1.5',di:39.0},{dn:'54x1.5',di:51.0},{dn:'76.1x2.0',di:72.1},{dn:'88.9x2.0',di:84.9},{dn:'108x2.0',di:104.0}]},
  {id:'mepla',       name:'Geberit Mepla',        lieferant:'Geberit AG', status:'verifiziert',         material:'Mehrschicht', k:0.007,
   dims:[{dn:'16x2.25',di:11.5},{dn:'20x2.50',di:15.0},{dn:'26x3.00',di:20.0},{dn:'32x3.00',di:26.0},{dn:'40x3.50',di:33.0},{dn:'50x4.00',di:42.0},{dn:'63x4.50',di:54.0},{dn:'75x4.70',di:65.6}]},
  {id:'pushfit',     name:'Geberit PushFit',      lieferant:'Geberit AG', status:'verifiziert',       material:'Mehrschicht', k:0.007,
   dims:[{dn:'16x2.0',di:12.0},{dn:'20x2.0',di:16.0},{dn:'25x2.5',di:20.0}]},
  {id:'flowfit',     name:'Geberit FlowFit',      lieferant:'Geberit AG', status:'verifiziert',       material:'Mehrschicht', k:0.007,
   dims:[{dn:'16x2.0',di:12.0},{dn:'20x2.0',di:16.0},{dn:'25x2.5',di:20.0},{dn:'32x3.0',di:26.4},{dn:'40x3.0',di:34.0},{dn:'50x3.8',di:42.4},{dn:'63x4.0',di:55.0},{dn:'75x4.6',di:65.8}]},
  {id:'instaflex_k',   name:'+GF+ Instaflex (Klemm)', material:'Mehrschicht', k:0.007,
   dims:[{dn:'16x2.0',di:11.6},{dn:'20x2.0',di:14.4},{dn:'25x2.5',di:20.4},{dn:'32x3.0',di:26.2}]},
  {id:'instaflex_s',   name:'+GF+ Instaflex (Schweiss)', material:'Mehrschicht', k:0.007,
   dims:[{dn:'16x2.2',di:11.6},{dn:'20x2.8',di:14.4},{dn:'25x2.3',di:20.4},{dn:'32x2.9',di:26.2},{dn:'40x3.7',di:32.6},{dn:'50x4.6',di:40.8},{dn:'63x6.3',di:50.4},{dn:'75x6.8',di:61.4},{dn:'90x8.2',di:73.6},{dn:'110x10.0',di:90.0}]},
  {id:'sanipex',       name:'JRG Sanipex Classic',   material:'Mehrschicht', k:0.007,
   dims:[{dn:'12x1.7',di:8.6},{dn:'16x2.2',di:11.6},{dn:'20x2.8',di:14.4},{dn:'25x3.5',di:18.0},{dn:'32x4.4',di:23.2},{dn:'40x5.5',di:29.0},{dn:'50x6.9',di:36.2},{dn:'63x8.7',di:45.6}]},
  {id:'sanipex_mt',    name:'JRG Sanipex MT®',       material:'Mehrschicht', k:0.007,
   dims:[{dn:'16x2.25',di:11.5},{dn:'20x2.50',di:15.0},{dn:'26x3.00',di:20.0},{dn:'32x3.00',di:26.0},{dn:'40x3.50',di:33.0},{dn:'50x4.00',di:42.0},{dn:'63x4.50',di:54.0}]},
  {id:'optipress',     name:'RN Optipress',         lieferant:'R. Nussbaum AG', status:'verifiziert',          material:'Edelstahl 1.4521', k:0.0015,
   dims:[{dn:'15x1.0',di:13.0},{dn:'18x1.0',di:16.0},{dn:'22x1.2',di:19.6},{dn:'28x1.2',di:25.6},{dn:'35x1.5',di:32.0},{dn:'42x1.5',di:39.0},{dn:'54x1.5',di:51.0},{dn:'64x2.0',di:60.0},{dn:'76.1x2.0',di:72.1},{dn:'88.9x2.0',di:84.9},{dn:'108x2.0',di:104.0}]},
  /* Optiflex gibt es bis 25 mm (Feedback 29.07.2026 Sandro) — grössere
     Dimensionen laufen bei Nussbaum über Optipress. Die früheren 32–63er
     bleiben als legacy auflösbar (gespeicherte Berechnungen), erscheinen
     aber in keiner Auswahl mehr. */
  {id:'optiflex',      name:'RN Optiflex',          lieferant:'R. Nussbaum AG', status:'verifiziert',           material:'Mehrschicht', k:0.007,
   /* 16x3.8 (di 8.4) = das «12er»-Rohr für Einzelzapfstellen/Ausstossleitungen
      (Feedback Sandro 31.07.2026 «Bei R. Nussbaum fehlt das 12mm Rohr resp.
      16mm × 3.8mm Rohr»). */
   dims:[{dn:'16x3.8',di:8.4},{dn:'16x2.2',di:11.6},{dn:'20x2.8',di:14.4},{dn:'25x2.7',di:19.6},
         {dn:'32x3.2',di:25.6,legacy:true},{dn:'40x3.5',di:33.0,legacy:true},{dn:'50x4.00',di:42.0,legacy:true},{dn:'63x4.50',di:54.0,legacy:true}]},
  {id:'kupfer',        name:'Kupfer',               lieferant:'—', status:'verifiziert',                material:'Cu', k:0.0015,
   dims:[{dn:'12x1.0',di:10.0},{dn:'15x1.0',di:13.0},{dn:'18x1.0',di:16.0},{dn:'22x1.0',di:20.0},{dn:'28x1.5',di:25.0},{dn:'35x1.5',di:32.0},{dn:'42x1.5',di:39.0},{dn:'54x2.0',di:50.0},{dn:'76.1x2.0',di:72.1}]},
  {id:'stahl',         name:'Stahl verzinkt',       lieferant:'—', status:'verifiziert',        material:'Stahl', k:0.15,
   dims:[{dn:'1/2"',di:16.0},{dn:'3/4"',di:21.6},{dn:'1"',di:27.2},{dn:'5/4"',di:35.9},{dn:'1½"',di:41.8},{dn:'2"',di:53.0},{dn:'2½"',di:68.8},{dn:'3"',di:80.8},{dn:'4"',di:105.3}]},
  {id:'pe10',          name:'PE-Druckrohr PN10',    lieferant:'—', status:'verifiziert',     material:'PE', k:0.007,
   dims:[{dn:'20x2.9',di:14.2},{dn:'25x2.9',di:19.2},{dn:'32x2.9',di:26.2},{dn:'40x2.9',di:34.2},{dn:'50x3.0',di:44.0},{dn:'63x3.8',di:55.4},{dn:'75x4.5',di:66.0},{dn:'90x5.4',di:79.2},{dn:'110x6.6',di:96.8}]},
  {id:'pe16',          name:'PE-Druckrohr PN16',    lieferant:'—', status:'verifiziert',     material:'PE', k:0.007,
   dims:[{dn:'20x2.9',di:14.2},{dn:'25x2.9',di:19.2},{dn:'32x2.9',di:26.2},{dn:'40x3.7',di:32.6},{dn:'50x4.6',di:40.8},{dn:'63x5.8',di:51.4},{dn:'75x6.8',di:61.4},{dn:'90x8.2',di:73.6},{dn:'110x10.0',di:90.0}]},
];

/* ══ Zusammengefasste Lieferanten-Systeme (Feedback 28.07.2026) ═══════════
   «RN Optipress und Optiflex in Nussbaum zusammenfassen. Wenn die Teilstücke
   dimensioniert werden, sollen alle Dimensionen wählbar sein. JRG identisch.»
   Ein Eintrag pro Lieferant; jede Dimension trägt ihre HERKUNFT (Fabrikat)
   und deren Rauhigkeit k — Edelstahl (0.0015) und Mehrschicht (0.007)
   unterscheiden sich, darum k PRO DIMENSION statt pro System.
   Die Einzelsysteme bleiben in SYSTEMS (hidden) — gespeicherte Berechnungen
   und der Formstück-Katalog laufen unverändert weiter. */
const MERGED_SYSTEMS = [
  /* Reihenfolge der teile = Reihenfolge in der Dimensions-Auswahl (Feedback
     29.07.2026: «Optiflex zuerst und dann Optipress von klein nach gross»). */
  { id:'nussbaum', name:'R. Nussbaum (Optipress + Optiflex)', lieferant:'R. Nussbaum AG',
    status:'verifiziert', material:'Edelstahl / Mehrschicht', teile:['optiflex','optipress'] },
  { id:'jrg',      name:'JRG Sanipex (Classic + MT®)',         lieferant:'Georg Fischer JRG AG',
    status:'verifiziert', material:'Mehrschicht',              teile:['sanipex','sanipex_mt'] }
];
(function buildMergedSystems(){
  MERGED_SYSTEMS.forEach(function(m){
    var dims = [], k0 = null;
    m.teile.forEach(function(tid, gi){
      var t = SYSTEMS.find(function(s){ return s.id===tid; });
      if(!t) return;
      t.hidden = true;                       // nicht mehr einzeln in der Auswahl
      if(k0===null) k0 = t.k;
      // Kurzname des Fabrikats: «RN Optipress» → «Optipress»
      var kurz = t.name.replace(/^(RN|JRG|Geberit|\+GF\+)\s+/,'');
      t.dims.forEach(function(d){
        // gleiche Bezeichnung UND gleicher Innendurchmesser → nur einmal führen
        if(dims.some(function(x){ return x.dn===d.dn && Math.abs(x.di-d.di)<0.05; })) return;
        dims.push({ dn:d.dn, di:d.di, k:t.k, src:t.id, srcName:kurz, grp:gi, legacy:d.legacy||undefined });
      });
    });
    /* Sortierung: nach Fabrikat gruppiert (teile-Reihenfolge), innerhalb der
       Gruppe klein → gross. Legacy-Dimensionen ans Ende ihrer Gruppe — sie
       tauchen nur bei Alt-Berechnungen auf (dimAuswahl filtert sie). */
    dims.sort(function(a,b){ return (a.grp-b.grp) || ((a.legacy?1:0)-(b.legacy?1:0)) || (a.di-b.di); });
    SYSTEMS.push({ id:m.id, name:m.name, lieferant:m.lieferant, status:m.status,
                   material:m.material, k:k0==null?0.007:k0, merged:true, dims:dims });
  });
})();
/** Wählbare Dimensionen eines Systems — legacy nur, wenn die Zeile sie
    bereits nutzt (Bestandsschutz gespeicherter Berechnungen). */
function dimAuswahl(sys, aktDn){
  if(!sys) return [];
  return sys.dims.filter(function(d){ return !d.legacy || d.dn===aktDn; });
}
/** Systeme für die Auswahl (ohne die in Sammel-Systemen aufgegangenen Fabrikate). */
function sysAuswahl(){ return SYSTEMS.filter(function(s){ return !s.hidden; }); }
/** Beschriftung einer Dimension — im Sammel-System mit Herkunft. */
function dimLabel(dim){
  if(!dim) return '';
  // im Sammel-System kompakter, damit das Fabrikat sichtbar bleibt
  return dim.srcName
    ? dim.dn + ' (' + dim.di + ') · ' + dim.srcName
    : dim.dn + ' (di ' + dim.di + ' mm)';
}
/** Rohrsystem per id (auch die in Sammel-Systemen aufgegangenen Fabrikate). */
function sysById(id){ return SYSTEMS.find(function(s){ return s.id===id; }) || null; }

/* Linearer Ausdehnungskoeffizient α [10⁻⁶ 1/K] je Werkstoff — Vorbelegung im
   Druckanstieg (das Feld bleibt frei überschreibbar). Mehrschicht/PE dehnen
   sich deutlich stärker aus als Metall. */
var ALPHA = [
  { re:/edelstahl|cns/i,   a:16.5 },
  { re:/^cu$|kupfer/i,     a:16.6 },
  { re:/stahl/i,           a:12.0 },
  { re:/mehrschicht/i,     a:25.0 },
  { re:/^pe$|pe-x|pe-rt/i, a:150.0 }
];
/** α [10⁻⁶ 1/K] zu einem Werkstoff/System — null wenn nicht zuordenbar. */
function alphaFor(matOrSys){
  if(!matOrSys) return null;
  var m = typeof matOrSys==='string' ? matOrSys : (matOrSys.material||'');
  for(var i=0;i<ALPHA.length;i++){ if(ALPHA[i].re.test(m)) return ALPHA[i].a; }
  return null;
}

window.GemaRohre = { SYSTEMS:SYSTEMS, MERGED_SYSTEMS:MERGED_SYSTEMS, sysById:sysById,
  dimAuswahl:dimAuswahl, sysAuswahl:sysAuswahl, dimLabel:dimLabel, alphaFor:alphaFor };
})();
