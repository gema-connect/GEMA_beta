/**
 * gema_wasserdaten.js — Schweizer Trinkwasser-Datenbank v1
 * Wasserhärte und Qualitätsdaten nach PLZ/Ort.
 * Quelle: trinkwasser.ch (SVGW), Wasserversorger-Websites, öffentliche Berichte.
 * Stand: März 2026
 *
 * Verwendung:
 *   GemaWasser.getByPLZ('4051')        → {plz:'4051', ort:'Basel', haerte_fh:32, ...}
 *   GemaWasser.getByOrt('Zürich')      → [{plz:'8001', ...}, {plz:'8002', ...}]
 *   GemaWasser.search('Bern')          → alle Treffer für Bern
 *   GemaWasser.getHaerteStufe(32)      → {stufe:'ziemlich hart', farbe:'#f59e0b'}
 */
(function(w){
'use strict';

// ── Härtestufen nach Schweizer Lebensmittelgesetz ──
var STUFEN = [
  { von: 0,  bis: 7,  stufe: 'sehr weich',   farbe: '#3b82f6' },
  { von: 7,  bis: 15, stufe: 'weich',         farbe: '#22c55e' },
  { von: 15, bis: 25, stufe: 'mittelhart',    farbe: '#eab308' },
  { von: 25, bis: 32, stufe: 'ziemlich hart', farbe: '#f59e0b' },
  { von: 32, bis: 42, stufe: 'hart',          farbe: '#ef4444' },
  { von: 42, bis: 999,stufe: 'sehr hart',     farbe: '#dc2626' }
];

// ── Datenbank ──
// Jeder Eintrag: [PLZ, Ort, °fH, Na mg/l (oder null), Versorger, Bemerkung]
// Na = Natriumgehalt im Rohwasser (wo verfügbar)
var _raw = [
  // ── Kanton Zürich ──
  ['8001','Zürich',25,8,'WVZ','Mittelwert Stadtgebiet'],
  ['8002','Zürich',25,8,'WVZ',''],
  ['8003','Zürich',25,8,'WVZ',''],
  ['8004','Zürich',24,8,'WVZ',''],
  ['8005','Zürich',24,8,'WVZ',''],
  ['8006','Zürich',26,8,'WVZ',''],
  ['8008','Zürich',26,8,'WVZ',''],
  ['8032','Zürich',26,8,'WVZ',''],
  ['8037','Zürich',24,8,'WVZ',''],
  ['8038','Zürich',25,8,'WVZ',''],
  ['8041','Zürich',25,8,'WVZ',''],
  ['8044','Zürich',26,8,'WVZ','Gockhausen'],
  ['8045','Zürich',25,8,'WVZ',''],
  ['8046','Zürich',24,8,'WVZ','Affoltern'],
  ['8047','Zürich',25,8,'WVZ',''],
  ['8048','Zürich',25,8,'WVZ','Altstetten'],
  ['8049','Zürich',24,8,'WVZ','Höngg'],
  ['8050','Zürich',24,8,'WVZ','Oerlikon'],
  ['8051','Zürich',24,8,'WVZ',''],
  ['8052','Zürich',24,8,'WVZ','Seebach'],
  ['8053','Zürich',25,8,'WVZ',''],
  ['8055','Zürich',25,8,'WVZ','Friesenberg'],
  ['8057','Zürich',24,8,'WVZ',''],
  ['8064','Zürich',24,8,'WVZ',''],
  ['8400','Winterthur',35,6,'Stadtwerk Winterthur',''],
  ['8401','Winterthur',35,6,'Stadtwerk Winterthur',''],
  ['8402','Winterthur',35,6,'Stadtwerk Winterthur',''],
  ['8404','Winterthur',33,6,'Stadtwerk Winterthur','Reutlingen'],
  ['8406','Winterthur',34,6,'Stadtwerk Winterthur','Töss'],
  ['8600','Dübendorf',28,7,'WVZ',''],
  ['8610','Uster',30,7,'Stadtwerke Uster',''],
  ['8620','Wetzikon',32,6,'WV Wetzikon',''],
  ['8700','Küsnacht',22,8,'WVZ',''],
  ['8702','Zollikon',23,8,'WVZ',''],
  ['8706','Meilen',24,7,'WV Meilen',''],
  ['8708','Männedorf',24,7,'WV Männedorf',''],
  ['8800','Thalwil',23,8,'WVZ',''],
  ['8802','Kilchberg',23,8,'WVZ',''],
  ['8810','Horgen',22,7,'WV Horgen',''],
  ['8820','Wädenswil',20,7,'WV Wädenswil',''],
  ['8902','Urdorf',28,7,'WV Urdorf',''],
  ['8903','Birmensdorf',28,7,'WV Birmensdorf',''],
  ['8910','Affoltern a.A.',30,6,'WV Affoltern',''],
  ['8952','Schlieren',27,7,'WV Schlieren',''],
  ['8953','Dietikon',28,7,'WV Dietikon',''],

  // ── Kanton Bern ──
  ['3000','Bern',22,5,'Energie Wasser Bern','Mittelwert Stadtgebiet'],
  ['3001','Bern',22,5,'Energie Wasser Bern',''],
  ['3004','Bern',22,5,'Energie Wasser Bern',''],
  ['3005','Bern',22,5,'Energie Wasser Bern',''],
  ['3006','Bern',22,5,'Energie Wasser Bern',''],
  ['3007','Bern',22,5,'Energie Wasser Bern',''],
  ['3008','Bern',22,5,'Energie Wasser Bern',''],
  ['3010','Bern',23,5,'Energie Wasser Bern',''],
  ['3012','Bern',23,5,'Energie Wasser Bern',''],
  ['3014','Bern',22,5,'Energie Wasser Bern',''],
  ['3018','Bern',22,5,'Energie Wasser Bern','Bümpliz'],
  ['3027','Bern',22,5,'Energie Wasser Bern',''],
  ['3072','Ostermundigen',24,5,'WV Ostermundigen',''],
  ['3073','Gümligen',23,5,'WV Muri b. Bern',''],
  ['3074','Muri b. Bern',23,5,'WV Muri b. Bern',''],
  ['3097','Liebefeld',22,5,'Energie Wasser Bern',''],
  ['3098','Köniz',23,5,'WV Köniz',''],
  ['3400','Burgdorf',35,5,'WV Burgdorf',''],
  ['3600','Thun',18,4,'Energie Thun',''],
  ['3604','Thun',18,4,'Energie Thun',''],
  ['3700','Spiez',15,4,'WV Spiez','Seewasser-Einfluss'],
  ['3800','Interlaken',12,3,'WV Interlaken','Seewasser weich'],
  ['2500','Biel/Bienne',28,6,'ESB',''],
  ['2502','Biel/Bienne',28,6,'ESB',''],

  // ── Kanton Luzern ──
  ['6000','Luzern',22,5,'EWL',''],
  ['6003','Luzern',22,5,'EWL',''],
  ['6004','Luzern',22,5,'EWL',''],
  ['6005','Luzern',22,5,'EWL','St. Niklausen'],
  ['6006','Luzern',22,5,'EWL',''],
  ['6010','Kriens',24,5,'WV Kriens',''],
  ['6014','Luzern',22,5,'EWL',''],
  ['6020','Emmenbrücke',25,5,'WV Emmen',''],
  ['6030','Ebikon',24,5,'WV Ebikon',''],
  ['6300','Zug',25,6,'WWZ',''],
  ['6301','Zug',25,6,'WWZ',''],
  ['6312','Steinhausen',26,6,'WV Steinhausen',''],
  ['6330','Cham',26,6,'WV Cham',''],
  ['6340','Baar',27,6,'WV Baar',''],

  // ── Kanton Aargau ──
  ['5000','Aarau',34,7,'IBA',''],
  ['5001','Aarau',34,7,'IBA',''],
  ['5004','Aarau',34,7,'IBA',''],
  ['5012','Schönenwerd',36,7,'WV Schönenwerd',''],
  ['5200','Brugg',38,8,'WV Brugg',''],
  ['5210','Windisch',36,7,'WV Windisch',''],
  ['5300','Turgi',36,7,'WV Turgi',''],
  ['5400','Baden',33,7,'Regionalwerke Baden',''],
  ['5401','Baden',33,7,'Regionalwerke Baden',''],
  ['5430','Wettingen',32,7,'WV Wettingen',''],
  ['5442','Fislisbach',33,7,'WV Fislisbach',''],
  ['5610','Wohlen',35,6,'WV Wohlen',''],
  ['5620','Bremgarten',33,6,'WV Bremgarten',''],

  // ── Kanton Basel-Stadt / Baselland ──
  ['4000','Basel',32,8,'IWB','Mittelwert Stadtgebiet'],
  ['4001','Basel',32,8,'IWB',''],
  ['4051','Basel',32,8,'IWB',''],
  ['4052','Basel',32,8,'IWB',''],
  ['4053','Basel',32,8,'IWB',''],
  ['4054','Basel',32,8,'IWB',''],
  ['4055','Basel',32,8,'IWB',''],
  ['4056','Basel',32,8,'IWB',''],
  ['4057','Basel',32,8,'IWB',''],
  ['4058','Basel',32,8,'IWB',''],
  ['4059','Basel',32,8,'IWB',''],
  ['4125','Riehen',30,8,'WV Riehen',''],
  ['4132','Muttenz',35,8,'WV Muttenz',''],
  ['4142','Münchenstein',34,8,'WV Münchenstein',''],
  ['4153','Reinach',33,8,'WV Reinach',''],
  ['4410','Liestal',36,7,'WV Liestal',''],
  ['4414','Füllinsdorf',35,7,'WV Füllinsdorf',''],
  ['4416','Bubendorf',34,7,'WV Bubendorf',''],
  ['4450','Sissach',38,7,'WV Sissach',''],
  ['4460','Gelterkinden',36,7,'WV Gelterkinden',''],
  ['4466','Ormalingen',35,7,'WV Ormalingen',''],
  ['4800','Zofingen',35,7,'WV Zofingen',''],
  ['4802','Strengelbach',36,7,'WV Strengelbach',''],
  ['4900','Langenthal',38,6,'WV Langenthal',''],

  // ── Kanton Solothurn ──
  ['4500','Solothurn',32,7,'Regio Energie Solothurn',''],
  ['4502','Solothurn',32,7,'Regio Energie Solothurn',''],
  ['4600','Olten',34,7,'WV Olten',''],
  ['4614','Hägendorf',35,7,'WV Hägendorf',''],
  ['4702','Oensingen',36,7,'WV Oensingen',''],

  // ── Kanton St. Gallen ──
  ['9000','St. Gallen',20,5,'SGSW',''],
  ['9006','St. Gallen',20,5,'SGSW',''],
  ['9008','St. Gallen',20,5,'SGSW',''],
  ['9010','St. Gallen',20,5,'SGSW',''],
  ['9200','Gossau SG',22,5,'WV Gossau',''],
  ['9300','Wittenbach',21,5,'WV Wittenbach',''],
  ['9400','Rorschach',18,5,'WV Rorschach','Bodenseewasser'],
  ['9500','Wil SG',25,6,'TB Wil',''],

  // ── Kanton Thurgau ──
  ['8500','Frauenfeld',30,6,'WV Frauenfeld',''],
  ['8505','Pfyn',30,6,'WV Pfyn',''],
  ['8570','Weinfelden',28,6,'TB Weinfelden',''],
  ['8580','Amriswil',26,6,'WV Amriswil',''],
  ['8590','Romanshorn',20,5,'WV Romanshorn','Bodenseewasser'],
  ['9320','Arbon',19,5,'WV Arbon','Bodenseewasser'],

  // ── Kanton Graubünden ──
  ['7000','Chur',18,4,'IBC Energie Wasser Chur',''],
  ['7001','Chur',18,4,'IBC Energie Wasser Chur',''],
  ['7002','Chur',18,4,'IBC Energie Wasser Chur',''],
  ['7260','Davos',8,2,'WV Davos','Quellwasser weich'],
  ['7500','St. Moritz',6,2,'WV St. Moritz','Quellwasser sehr weich'],

  // ── Kanton Wallis ──
  ['1950','Sion',14,3,'WV Sion',''],
  ['1920','Martigny',12,3,'WV Martigny',''],
  ['3900','Brig',10,3,'WV Brig-Glis',''],
  ['3930','Visp',10,3,'WV Visp',''],

  // ── Kanton Tessin ──
  ['6500','Bellinzona',12,3,'AMB',''],
  ['6600','Locarno',10,3,'WV Locarno',''],
  ['6900','Lugano',15,4,'AIL',''],
  ['6901','Lugano',15,4,'AIL',''],

  // ── Kanton Waadt ──
  ['1000','Lausanne',22,6,'eauservice',''],
  ['1003','Lausanne',22,6,'eauservice',''],
  ['1004','Lausanne',22,6,'eauservice',''],
  ['1005','Lausanne',22,6,'eauservice',''],
  ['1006','Lausanne',22,6,'eauservice',''],
  ['1007','Lausanne',22,6,'eauservice',''],
  ['1010','Lausanne',22,6,'eauservice',''],
  ['1400','Yverdon',25,6,'WV Yverdon',''],
  ['1800','Vevey',22,6,'WV Vevey',''],
  ['1820','Montreux',20,5,'WV Montreux',''],

  // ── Kanton Genf ──
  ['1200','Genève',18,6,'SIG','Mittelwert'],
  ['1201','Genève',18,6,'SIG',''],
  ['1202','Genève',18,6,'SIG',''],
  ['1203','Genève',18,6,'SIG',''],
  ['1204','Genève',18,6,'SIG',''],
  ['1205','Genève',18,6,'SIG',''],
  ['1206','Genève',18,6,'SIG',''],
  ['1207','Genève',18,6,'SIG',''],
  ['1208','Genève',18,6,'SIG',''],
  ['1209','Genève',18,6,'SIG',''],
  ['1212','Grand-Lancy',18,6,'SIG',''],
  ['1213','Onex',18,6,'SIG',''],
  ['1214','Vernier',18,6,'SIG',''],
  ['1219','Aïre',18,6,'SIG',''],
  ['1226','Thônex',18,6,'SIG',''],
  ['1228','Plan-les-Ouates',18,6,'SIG',''],

  // ── Kanton Freiburg ──
  ['1700','Fribourg',28,5,'WV Fribourg',''],
  ['1701','Fribourg',28,5,'WV Fribourg',''],
  ['3280','Murten',30,5,'WV Murten',''],

  // ── Kanton Schwyz ──
  ['6430','Schwyz',15,4,'WV Schwyz',''],
  ['8640','Rapperswil-Jona',20,5,'WV Rapperswil-Jona','Obersee-Einfluss'],

  // ── Kanton Nidwalden / Obwalden ──
  ['6370','Stans',16,4,'WV Stans',''],
  ['6060','Sarnen',14,4,'WV Sarnen',''],

  // ── Kanton Uri ──
  ['6460','Altdorf UR',12,3,'WV Altdorf',''],

  // ── Kanton Glarus ──
  ['8750','Glarus',14,3,'TB Glarus',''],

  // ── Kanton Schaffhausen ──
  ['8200','Schaffhausen',28,6,'SH Power',''],
  ['8207','Schaffhausen',28,6,'SH Power',''],

  // ── Kanton Appenzell ──
  ['9050','Appenzell',16,4,'WV Appenzell',''],
  ['9100','Herisau',18,5,'WV Herisau',''],

  // ── Kanton Neuenburg ──
  ['2000','Neuchâtel',25,6,'Viteos',''],

  // ── Kanton Jura ──
  ['2800','Delémont',32,6,'WV Delémont','']
];

// ── Parse to objects ──
var DB = _raw.map(function(r){
  return {
    plz: r[0],
    ort: r[1],
    haerte_fh: r[2],
    natrium_mg: r[3],
    versorger: r[4],
    bemerkung: r[5] || '',
    quelle: 'trinkwasser.ch / Wasserversorger',
    stand: '2026-03'
  };
});

// ── Lookup by PLZ (exact) ──
function getByPLZ(plz){
  if(!plz) return null;
  var p = String(plz).trim();
  return DB.find(function(d){ return d.plz === p; }) || null;
}

// ── Lookup by Ort (partial match, case-insensitive) ──
function getByOrt(ort){
  if(!ort) return [];
  var q = ort.toLowerCase().trim();
  return DB.filter(function(d){ return d.ort.toLowerCase().indexOf(q) >= 0; });
}

// ── Search (PLZ or Ort) ──
function search(query){
  if(!query) return [];
  var q = String(query).trim();
  // Try PLZ first
  if(/^\d{4}$/.test(q)){
    var byPlz = getByPLZ(q);
    return byPlz ? [byPlz] : [];
  }
  // Partial PLZ
  if(/^\d{1,3}$/.test(q)){
    return DB.filter(function(d){ return d.plz.indexOf(q) === 0; });
  }
  // Ort
  return getByOrt(q);
}

// ── Härtestufe ──
function getHaerteStufe(fh){
  if(!fh && fh !== 0) return null;
  var v = Number(fh);
  for(var i=0; i<STUFEN.length; i++){
    if(v >= STUFEN[i].von && v < STUFEN[i].bis) return STUFEN[i];
    if(i === STUFEN.length-1 && v >= STUFEN[i].von) return STUFEN[i];
  }
  return null;
}

// ── Expose ──
w.GemaWasser = {
  getByPLZ: getByPLZ,
  getByOrt: getByOrt,
  search: search,
  getHaerteStufe: getHaerteStufe,
  STUFEN: STUFEN,
  DB: DB,
  VERSION: '1.0',
  STAND: '2026-03',
  QUELLE: 'trinkwasser.ch (SVGW) / Wasserversorger-Websites'
};

})(window);
