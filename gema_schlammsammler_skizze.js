/* gema_schlammsammler_skizze.js — geteilte, bemasste Schlammsammler-Skizze
 *
 * EINE Zeichnung für zwei Module: sa_schlammsammler.html (Einzelauslegung) und
 * sb_niederschlag.html (Visualisierung je Schlammsammler). Damit sehen beide
 * Module dasselbe Bild und eine Korrektur wirkt an beiden Orten.
 *
 * Regeln (Feedback 23.08.2026):
 *  - NUR literale Hex-Farben — GemaPDF/html2canvas rastert var() falsch.
 *  - JEDE Zone bekommt eine Mindesthöhe (`verteile`); die Leinwand wächst,
 *    statt einen Text unlesbar zu quetschen. Zusätzlich `passFont`
 *    (Shrink-to-fit) für jede Beschriftung.
 *  - Der Abscheideraum beginnt an der UNTERKANTE des Auslaufs
 *    (= Auslaufsohle) — Freiraum · Abscheideraum h · Schlammraum.
 *  - Der Einlauf liegt LINKS, alle Massketten rechts: sie kreuzen sich nie.
 *  - Die Texte der senkrechten Massketten stehen ZENTRIERT auf ihrer Linie
 *    (rotate(-90) + text-anchor=middle) und links davon.
 *  - Mehrere Einläufe → «Verschiedene Einläufe / Tiefster: x.xx m»
 *    (der tiefste ist der massgebende gegenüber der Auslaufsohle).
 */
(function(){
  'use strict';

  /* ── Geometrie (viewBox-Einheiten) ────────────────────────────── */
  var W    = 700;                            // viewBox-Breite
  var MT   = 96;                             // Terrain / Deckel-Oberkante
  var SX   = 210, SW = 240, RX = SX + SW;    // Schacht links / Breite / rechts
  var EX0  = 144;                            // Einlaufrohr beginnt
  var ELBL = EX0 - 6;                        // Einlauf-Beschriftung endet
  var AX1  = 512;                            // Auslaufrohr endet
  var LBX  = AX1 + 6, LBW = 78;              // Auslauf-Beschriftung
  var LX1  = 618;                            // Masskette Auslauftiefe
  var LX2  = 662;                            // Masskette Schachttiefe
  var HMIN = 58;                             // Mindesthöhe einer Zone [px]
  var HGES = 340;                            // Ziel-Gesamthöhe der Zonen [px]

  /* ── Farben — ausschliesslich literale Hex ────────────────────── */
  var C = {
    grund:'#f8fafc', wand:'#0f172a', linie:'#64748b', text:'#0f172a', klein:'#475569',
    frei:'#f1f5f9',  freiBd:'#cbd5e1',
    wasser:'#dbeafe', wasserBd:'#93c5fd',
    schlamm:'#fde68a', schlammBd:'#f59e0b',
    rohr:'#cbd5e1', rohrBd:'#475569',
    terrain:'#94a3b8', frost:'#dc2626', deckel:'#94a3b8'
  };

  function esc(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function num(x){ var v = parseFloat(x); return isFinite(v) ? v : NaN; }
  function fixM(x, d){ return isFinite(x) ? x.toFixed(d == null ? 2 : d) + ' m' : '– m'; }

  /* Textbreite grob schätzen (DM Sans ≈ 0.54 em pro Zeichen) */
  function breite(txt, fs){ return String(txt == null ? '' : txt).length * fs * 0.54; }

  /* Shrink-to-fit: grösste Schrift, bei der der Text noch in maxW passt. */
  function passFont(txt, maxW, fs, minFs){
    fs = fs || 12; minFs = minFs || 7;
    var f = fs;
    while (f > minFs && breite(txt, f) > maxW) f -= 0.5;
    return Math.round(f * 10) / 10;
  }

  /* Höhen proportional verteilen, aber NIE unter minPx — die Leinwand
   * wächst notfalls, damit jede Zone ihre Beschriftung tragen kann. */
  function verteile(werte, gesamt, minPx){
    var n = werte.length, i;
    if (!n) return [];
    var w = [], summe = 0;
    for (i = 0; i < n; i++){ var v = Math.max(0, num(werte[i]) || 0); w.push(v); summe += v; }
    if (gesamt < n * minPx) gesamt = n * minPx;
    if (!(summe > 0)){
      var g = gesamt / n, gl = [];
      for (i = 0; i < n; i++) gl.push(g);
      return gl;
    }
    var hoehen = new Array(n), fix = new Array(n);
    for (i = 0; i < n; i++) fix[i] = false;
    for (var runde = 0; runde <= n; runde++){
      var restPx = gesamt, restSum = 0, offen = 0, neu = false;
      for (i = 0; i < n; i++){ if (fix[i]) restPx -= minPx; else { restSum += w[i]; offen++; } }
      for (i = 0; i < n; i++){
        if (fix[i]){ hoehen[i] = minPx; continue; }
        hoehen[i] = restSum > 0 ? restPx * (w[i] / restSum) : (offen > 0 ? restPx / offen : minPx);
        if (hoehen[i] < minPx - 0.01){ fix[i] = true; neu = true; }
      }
      if (!neu) break;
    }
    for (i = 0; i < n; i++) if (fix[i]) hoehen[i] = minPx;
    return hoehen;
  }

  /* Tiefe [m] → y [px]; innerhalb der Zone linear interpoliert, weil die
   * Zonen wegen der Mindesthöhe NICHT massstäblich sind. */
  function yVonTiefe(zonen, t){
    if (!isFinite(t) || !zonen.length) return NaN;
    for (var i = 0; i < zonen.length; i++){
      var z = zonen[i];
      if (t >= z.von - 1e-9 && t <= z.bis + 1e-9){
        var sp = z.bis - z.von;
        return sp > 1e-9 ? z.y0 + (t - z.von) / sp * (z.y1 - z.y0) : z.y0;
      }
    }
    var erst = zonen[0], letzt = zonen[zonen.length - 1];
    return t < erst.von ? erst.y0 : letzt.y1;
  }

  /* ── SVG ──────────────────────────────────────────────────────── */
  function svg(d){
    d = d || {};
    var auslauf = num(d.auslauf);
    var hAbsch  = num(d.h);
    var schlamm = num(d.schlamm);
    var nutz    = num(d.nutz);
    var abgang  = num(d.abgangDn); if (!isFinite(abgang) || abgang <= 0) abgang = 110;
    var dnSch   = num(d.dn);
    var frost   = !!d.frost;
    var fGrenze = isFinite(num(d.frostGrenze)) ? num(d.frostGrenze) : 0.80;

    /* Zonen bestimmen: 3-Zonen (Einzelauslegung) oder 2-Zonen (Niederschlag). */
    var dreiZonen = isFinite(hAbsch) && hAbsch > 0;
    var zFrei = isFinite(auslauf) && auslauf > 0 ? auslauf : 0.9;
    var zonenDef;
    if (dreiZonen){
      var zSchl = isFinite(schlamm) && schlamm > 0 ? schlamm : 0.5;
      zonenDef = [
        { key:'frei',    name:'Freiraum',        wert:auslauf, tiefe:zFrei,   fill:C.frei,    bd:C.freiBd },
        { key:'abschei', name:'Abscheideraum h', wert:hAbsch,  tiefe:hAbsch,  fill:C.wasser,  bd:C.wasserBd },
        { key:'schlamm', name:'Schlammraum',     wert:schlamm, tiefe:zSchl,   fill:C.schlamm, bd:C.schlammBd }
      ];
    } else {
      var zNutz = isFinite(nutz) && nutz > 0 ? nutz : 1.0;
      zonenDef = [
        { key:'frei', name:'Freiraum',                     wert:auslauf, tiefe:zFrei, fill:C.frei,   bd:C.freiBd },
        { key:'nutz', name:d.nutzLabel || 'Nutzraum',      wert:nutz,    tiefe:zNutz, fill:C.wasser, bd:C.wasserBd }
      ];
    }

    var hoehen = verteile(zonenDef.map(function(z){ return z.tiefe; }), HGES, HMIN);
    var zonen = [], y = MT, tiefe = 0, i;
    for (i = 0; i < zonenDef.length; i++){
      var z = zonenDef[i];
      zonen.push({
        key:z.key, name:z.name, wert:z.wert, fill:z.fill, bd:z.bd,
        von:tiefe, bis:tiefe + z.tiefe, y0:y, y1:y + hoehen[i]
      });
      y += hoehen[i]; tiefe += z.tiefe;
    }
    var BOT = y;
    var sohleTiefe = isFinite(num(d.sohle)) ? num(d.sohle) : tiefe;
    var H = Math.round(BOT + 80);

    /* Rohrstärke: massstäblich, aber lesbar geklemmt. */
    var skala = (BOT - MT) / Math.max(0.3, tiefe);
    var dPx = Math.max(9, Math.min(26, (abgang / 1000) * skala));

    var yAus = yVonTiefe(zonen, isFinite(auslauf) ? auslauf : zFrei);

    /* Einläufe — der TIEFSTE ist massgebend. */
    var eins = (d.einlaeufe || []).map(function(e){
      return { name: e && e.name, tiefe: num(e && e.tiefe) };
    }).filter(function(e){ return isFinite(e.tiefe); });
    var einTiefste = eins.length ? Math.max.apply(null, eins.map(function(e){ return e.tiefe; })) : NaN;
    var yEin = isFinite(einTiefste) ? yVonTiefe(zonen, einTiefste)
                                    : (isFinite(yAus) ? yAus - Math.max(18, dPx + 6) : MT + 60);
    if (yEin < MT + dPx + 6) yEin = MT + dPx + 6;   // nie in den Deckel hinein

    var o = [];
    o.push('<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Schlammsammler-Skizze">');
    o.push('<defs><marker id="ssk-pf" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto-start-reverse">' +
           '<path d="M0 0 L9 4.5 L0 9 z" fill="' + C.linie + '"/></marker></defs>');
    o.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#ffffff"/>');

    /* Terrain */
    o.push('<path d="M56 ' + MT + ' L586 ' + MT + '" stroke="' + C.terrain + '" stroke-width="2" fill="none"/>');
    for (var tx = 62; tx < 586; tx += 26)
      o.push('<path d="M' + tx + ' ' + MT + ' L' + (tx - 7) + ' ' + (MT + 8) + '" stroke="' + C.terrain + '" stroke-width="1" fill="none"/>');
    o.push('<text x="60" y="' + (MT - 10) + '" font-size="11" font-weight="600" fill="' + C.klein + '">Terrain</text>');

    /* Schacht */
    o.push('<rect x="' + SX + '" y="' + MT + '" width="' + SW + '" height="' + (BOT - MT) + '" fill="' + C.grund + '" stroke="' + C.wand + '" stroke-width="2.4" rx="6"/>');

    /* Zonen */
    for (i = 0; i < zonen.length; i++){
      var zz = zonen[i], zh = zz.y1 - zz.y0;
      o.push('<rect x="' + (SX + 3) + '" y="' + (zz.y0 + (i === 0 ? 2 : 0)) + '" width="' + (SW - 6) + '" height="' + (zh - (i === 0 ? 2 : 0)) + '" fill="' + zz.fill + '" stroke="' + zz.bd + '" stroke-width="1.2"/>');
      var cy = zz.y0 + zh / 2, maxW = SW - 22, cx = SX + SW / 2;
      var wert = fixM(zz.wert, 2);
      if (zh >= 32){
        var f1 = passFont(zz.name, maxW, 12, 7.5);
        var f2 = passFont(wert, maxW, 11, 7);
        o.push('<text x="' + cx + '" y="' + (cy - 3) + '" text-anchor="middle" font-size="' + f1 + '" font-weight="700" fill="' + C.text + '">' + esc(zz.name) + '</text>');
        o.push('<text x="' + cx + '" y="' + (cy + 13) + '" text-anchor="middle" font-size="' + f2 + '" fill="' + C.klein + '">' + esc(wert) + '</text>');
      } else {
        var eine = zz.name + ' ' + wert;
        o.push('<text x="' + cx + '" y="' + (cy + 4) + '" text-anchor="middle" font-size="' + passFont(eine, maxW, 11, 7) + '" font-weight="600" fill="' + C.text + '">' + esc(eine) + '</text>');
      }
    }

    /* Deckel */
    o.push('<rect x="' + (SX - 8) + '" y="' + (MT - 9) + '" width="' + (SW + 16) + '" height="9" fill="' + C.deckel + '" stroke="' + C.wand + '" stroke-width="1.4" rx="2"/>');
    if (String(d.deckel || '') === 'gelocht'){
      for (var px = SX + 14; px < RX - 8; px += 22)
        o.push('<circle cx="' + px + '" cy="' + (MT - 4.5) + '" r="2.2" fill="#ffffff"/>');
    }

    /* Einlauf LINKS — kreuzt weder Mass- noch Beschriftungslinien */
    o.push('<rect x="' + EX0 + '" y="' + (yEin - dPx) + '" width="' + (SX + 4 - EX0) + '" height="' + dPx + '" fill="' + C.rohr + '" stroke="' + C.rohrBd + '" stroke-width="1.4"/>');
    o.push('<path d="M' + (EX0 + 8) + ' ' + (yEin - dPx / 2) + ' L' + (SX - 6) + ' ' + (yEin - dPx / 2) + '" stroke="' + C.rohrBd + '" stroke-width="1.2" fill="none" marker-end="url(#ssk-pf)"/>');

    var eZ1, eZ2;
    if (eins.length > 1){ eZ1 = 'Verschiedene Einläufe'; eZ2 = 'Tiefster: ' + fixM(einTiefste, 2); }
    else if (eins.length === 1){ eZ1 = eins[0].name || 'Einlauf'; eZ2 = 'Sohle ' + fixM(einTiefste, 2); }
    // Ohne erfasste Einlauftiefen (sb_niederschlag kennt nur die zugeordneten
    // Flächen) darf der Aufrufer die Beschriftung selbst setzen — «Sohle – m»
    // wäre dort keine fehlende Angabe, sondern eine Angabe, die es nicht gibt.
    else { eZ1 = d.einlaufTitel || 'Einlauf'; eZ2 = (d.einlaufNotiz != null ? d.einlaufNotiz : 'Sohle – m'); }
    var eMaxW = ELBL - 8;
    var eUnten = (yEin - dPx - 8) < (MT + 14);     // zu nah am Terrain → unter das Rohr
    var eY = eUnten ? (yEin + 15) : (yEin - dPx - 20);
    o.push('<text x="' + ELBL + '" y="' + eY + '" text-anchor="end" font-size="' + passFont(eZ1, eMaxW, 11.5, 7.5) + '" font-weight="700" fill="' + C.text + '">' + esc(eZ1) + '</text>');
    o.push('<text x="' + ELBL + '" y="' + (eY + 14) + '" text-anchor="end" font-size="' + passFont(eZ2, eMaxW, 10.5, 7) + '" fill="' + C.klein + '">' + esc(eZ2) + '</text>');

    /* Auslauf RECHTS */
    o.push('<rect x="' + (RX - 4) + '" y="' + (yAus - dPx) + '" width="' + (AX1 - RX + 4) + '" height="' + dPx + '" fill="' + C.rohr + '" stroke="' + C.rohrBd + '" stroke-width="1.4"/>');
    o.push('<path d="M' + (RX + 6) + ' ' + (yAus - dPx / 2) + ' L' + (AX1 - 6) + ' ' + (yAus - dPx / 2) + '" stroke="' + C.rohrBd + '" stroke-width="1.2" fill="none" marker-end="url(#ssk-pf)"/>');
    var aZ1 = 'Auslauf', aZ2 = 'Ø ' + Math.round(abgang) + ' mm';
    var aY = yAus - dPx - 8;
    if (aY < MT + 14) aY = yAus + 15;
    o.push('<text x="' + LBX + '" y="' + aY + '" font-size="' + passFont(aZ1, LBW, 11.5, 7.5) + '" font-weight="700" fill="' + C.text + '">' + esc(aZ1) + '</text>');
    o.push('<text x="' + LBX + '" y="' + (aY + 14) + '" font-size="' + passFont(aZ2, LBW, 10.5, 7) + '" fill="' + C.klein + '">' + esc(aZ2) + '</text>');

    /* Frostgrenze */
    if (frost && isFinite(fGrenze)){
      var yF = yVonTiefe(zonen, fGrenze);
      if (isFinite(yF)){
        o.push('<path d="M' + (SX - 44) + ' ' + yF + ' L' + (AX1 + 2) + ' ' + yF + '" stroke="' + C.frost + '" stroke-width="1.4" stroke-dasharray="6 4" fill="none"/>');
        var fT = 'Frostgrenze ' + fixM(fGrenze, 2);
        var nahRohr = Math.abs(yF - (yAus - dPx / 2)) < 20;
        var fY = nahRohr ? (yF + 14) : (yF - 6);
        o.push('<text x="' + (AX1 - 2) + '" y="' + fY + '" text-anchor="end" font-size="' + passFont(fT, 150, 10, 7) + '" font-weight="700" fill="' + C.frost + '">' + esc(fT) + '</text>');
      }
    }

    /* Massketten rechts — Text zentriert auf der Linie, links davon */
    function kette(lx, yA, yB, txt){
      if (!isFinite(yA) || !isFinite(yB) || Math.abs(yB - yA) < 2) return;
      o.push('<path d="M' + lx + ' ' + yA + ' L' + lx + ' ' + yB + '" stroke="' + C.linie + '" stroke-width="1.2" fill="none" marker-start="url(#ssk-pf)" marker-end="url(#ssk-pf)"/>');
      o.push('<path d="M' + (lx - 7) + ' ' + yA + ' L' + (lx + 7) + ' ' + yA + '" stroke="' + C.linie + '" stroke-width="1" fill="none"/>');
      o.push('<path d="M' + (lx - 7) + ' ' + yB + ' L' + (lx + 7) + ' ' + yB + '" stroke="' + C.linie + '" stroke-width="1" fill="none"/>');
      var cy = (yA + yB) / 2, cx = lx - 4;
      var fs = passFont(txt, Math.abs(yB - yA) - 10, 11, 7);
      o.push('<text x="' + cx + '" y="' + cy + '" text-anchor="middle" font-size="' + fs + '" font-weight="600" fill="' + C.klein + '" transform="rotate(-90 ' + cx + ' ' + cy + ')">' + esc(txt) + '</text>');
    }
    o.push('<path d="M' + (AX1 + 2) + ' ' + MT + ' L' + (LX2 + 8) + ' ' + MT + '" stroke="' + C.linie + '" stroke-width="0.8" stroke-dasharray="3 3" fill="none"/>');
    if (isFinite(yAus)) o.push('<path d="M' + (AX1 + 2) + ' ' + yAus + ' L' + (LX1 + 8) + ' ' + yAus + '" stroke="' + C.linie + '" stroke-width="0.8" stroke-dasharray="3 3" fill="none"/>');
    o.push('<path d="M' + RX + ' ' + BOT + ' L' + (LX2 + 8) + ' ' + BOT + '" stroke="' + C.linie + '" stroke-width="0.8" stroke-dasharray="3 3" fill="none"/>');
    kette(LX1, MT, yAus, 'Auslauftiefe ' + fixM(auslauf, 2));
    kette(LX2, MT, BOT, 'Schachttiefe ' + fixM(sohleTiefe, 2));

    /* Ø Schacht unten — Beschriftung zentriert ÜBER der Masslinie */
    var yD = BOT + 42, mx = (SX + RX) / 2;
    o.push('<path d="M' + SX + ' ' + yD + ' L' + RX + ' ' + yD + '" stroke="' + C.linie + '" stroke-width="1.2" fill="none" marker-start="url(#ssk-pf)" marker-end="url(#ssk-pf)"/>');
    o.push('<path d="M' + SX + ' ' + (BOT + 4) + ' L' + SX + ' ' + (yD + 7) + '" stroke="' + C.linie + '" stroke-width="1" stroke-dasharray="3 3" fill="none"/>');
    o.push('<path d="M' + RX + ' ' + (BOT + 4) + ' L' + RX + ' ' + (yD + 7) + '" stroke="' + C.linie + '" stroke-width="1" stroke-dasharray="3 3" fill="none"/>');
    var dTxt = isFinite(dnSch) ? ('Ø Schacht  DN ' + Math.round(dnSch)) : 'Ø Schacht  DN –';
    o.push('<text x="' + mx + '" y="' + (yD - 7) + '" text-anchor="middle" font-size="' + passFont(dTxt, SW - 4, 12, 8) + '" font-weight="700" fill="' + C.text + '">' + esc(dTxt) + '</text>');

    var info = [];
    if (isFinite(num(d.a))) info.push('A = ' + num(d.a).toFixed(3) + ' m²');
    if (d.deckel) info.push('Deckel: ' + d.deckel);
    if (isFinite(num(d.q))) info.push('Q = ' + num(d.q).toFixed(2) + ' l/s');
    if (info.length){
      var iTxt = info.join('  ·  ');
      o.push('<text x="' + mx + '" y="' + (yD + 26) + '" text-anchor="middle" font-size="' + passFont(iTxt, W - 120, 11, 7.5) + '" fill="' + C.klein + '">' + esc(iTxt) + '</text>');
    }

    o.push('</svg>');
    return o.join('');
  }

  var API = { svg: svg, verteile: verteile, yVonTiefe: yVonTiefe, passFont: passFont, breite: breite, FARBEN: C };
  if (typeof window !== 'undefined') window.GemaSSkizze = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
