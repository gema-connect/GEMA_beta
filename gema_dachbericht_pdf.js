/* gema_dachbericht_pdf.js — HTML/Print-Export fuer Spengler-Dachberichte
 *
 * Generiert aus einem Dachbericht-Objekt eine A4-Druckseite im Stil
 * der Schadensbericht-Vorlage und oeffnet ein neues Fenster mit
 * window.print() — kein Backend noetig.
 *
 * Logo-Branching:
 *   - opts.org.logo vorhanden  → Org-Logo (Base64 data-URL)
 *   - sonst                    → eingebettetes GEMA-Inline-SVG
 *
 * Bilder-Grid-Regel (User-Anforderung):
 *   - 1 Bild   → volle Breite
 *   - 2 Bilder → 1x2 Grid
 *   - 3-4 Bilder → 2x2 Grid (4 Bilder fuellen eine Seite)
 *   - 5-6 Bilder → 3x2 Grid (6 Bilder fuellen eine Seite)
 *   - mehr als 6 → erste 6 auf aktueller Seite, Rest auf naechster
 *
 * Aufruf: GemaDachberichtPDF.exportPrint(bericht, opts)
 *   opts = { org, user, objektName, objektAdresse, templates }
 */
(function(w){
  'use strict';

  // ── CSS (analog gema_schaden_pdf, mit kleinen Anpassungen) ─────────
  var REPORT_CSS = '@import url(\'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap\');'
    + ':root{--ink:#1f2933;--ink-soft:#525d66;--muted:#8a949c;--accent:#0891b2;--accent-deep:#0e7490;--forest:#0c4a2e;--line:#e4e8ec;--line-soft:#eef1f3;--tint:#f5f7f8;--tint-blue:#ecfeff;--ok:#15803d;--amber:#b45309;--red:#b91c1c;--paper:#ffffff;}'
    + '*{box-sizing:border-box;margin:0;padding:0;}'
    + 'html,body{font-family:\'DM Sans\',sans-serif;color:var(--ink);font-size:10.5pt;line-height:1.55;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-optical-sizing:auto;font-variation-settings:"opsz" 14;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}'
    + '@media screen{body{background:#dfe3e6;padding:32px 16px;}'
      + '.content{width:210mm;margin:0 auto;background:transparent;}'
      + '.content > .cover,.content > .report-section{width:210mm;min-height:297mm;background:var(--paper);box-shadow:0 8px 40px rgba(20,30,45,.18);margin:0 auto 28px;position:relative;overflow:hidden;}'
      + '.content > .report-section{padding:0;}'
    + '}'
    + '@media print{@page{size:A4;margin:14mm 0 14mm 0;}body{background:#fff;padding:0;}.content{width:auto;box-shadow:none;background:transparent;}'
      + '.content > .cover,.content > .report-section{box-shadow:none;margin:0;background:#fff;min-height:auto;}'
      + '.report-section{page-break-before:always;}'
      + '.cover{page-break-after:always;padding-top:0!important;}'
      + '.cover-hero{margin-top:22mm!important;}'
      + '.cover-foot{padding-bottom:0!important;margin-top:6mm!important;}'
      + '.page-body{padding:6mm 15mm 6mm!important;}'
      + '.no-print{display:none!important;}'
    + '}'
    + '.content{position:relative;}'
    + '.cover{padding:0 15mm;min-height:297mm;display:flex;flex-direction:column;}'
    + '.cover-bar{height:5pt;margin:0 -15mm;background:linear-gradient(90deg,var(--accent) 0%,var(--accent) 62%,var(--forest) 100%);}'
    + '.cover-top{display:flex;justify-content:space-between;align-items:center;padding:14mm 0 0;}'
    + '.brand{display:flex;align-items:center;gap:9px;}'
    + '.brand-logo-img{max-height:36px;max-width:160px;display:block;}'
    + '.brand-svg{height:32px;width:auto;display:block;}'
    + '.cover-doctype{font-size:8pt;letter-spacing:.22em;text-transform:uppercase;color:var(--muted);font-weight:600;}'
    + '.cover-hero{margin-top:34mm;}'
    + '.cover-eyebrow{display:inline-block;font-size:8.5pt;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);font-weight:700;padding-bottom:4px;border-bottom:2pt solid var(--accent);margin-bottom:14px;}'
    + '.cover-title{font-size:33pt;line-height:1.12;font-weight:700;color:var(--ink);letter-spacing:-.01em;max-width:160mm;}'
    + '.cover-sub{margin-top:10px;font-size:11pt;color:var(--ink-soft);}'
    + '.cover-meta{margin-top:auto;padding-top:14mm;display:grid;grid-template-columns:1fr 1fr 1fr;gap:9mm 12mm;border-top:.75pt solid var(--line);}'
    + '.meta-k{font-size:7.5pt;letter-spacing:.13em;text-transform:uppercase;color:var(--muted);font-weight:600;margin-bottom:2px;}'
    + '.meta-v{font-size:10.5pt;color:var(--ink);font-weight:500;}'
    + '.cover-foot{margin-top:9mm;padding-bottom:14mm;font-size:8pt;color:var(--muted);}'
    + '.page-body{padding:22mm 15mm 18mm;}'
    + '.sec-head{display:flex;align-items:center;gap:13px;border-bottom:1.5pt solid var(--accent);padding-bottom:9px;margin-bottom:20px;}'
    + '.sec-num{flex:0 0 auto;width:34px;height:34px;border-radius:6px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14pt;}'
    + '.sec-titles .sec-eyebrow{font-size:7.5pt;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);font-weight:600;}'
    + '.sec-titles .sec-title{font-size:16pt;font-weight:700;color:var(--ink);line-height:1.15;}'
    + '.block{margin-bottom:15px;break-inside:avoid;page-break-inside:avoid;}'
    + '.block-label{font-size:8pt;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);font-weight:700;margin-bottom:3px;}'
    // Fliesstext IMMER schwarz (User-Vorgabe) — wird nie von Brandfarben eingefaerbt
    + '.block-body{color:#000;font-size:10.5pt;}'
    + '.subhead{font-size:11pt;font-weight:700;color:var(--ink);margin:18px 0 8px;break-after:avoid;page-break-after:avoid;border-bottom:.5pt solid var(--line);padding-bottom:4px;}'
    + '.subhead-2{font-size:9.5pt;font-weight:700;color:var(--accent);margin:14px 0 6px;break-after:avoid;}'
    // Bilder-Grid: 1=full, 2=1x2, 3-4=2x2, 5-6=3x2
    + '.bigimg{margin:8px 0 16px;break-inside:avoid;page-break-inside:avoid;}'
    + '.bigimg img{width:100%;max-height:120mm;object-fit:cover;border-radius:6px;border:.75pt solid var(--line);display:block;}'
    + '.bigimg-cap{margin-top:5px;font-size:9pt;color:var(--muted);font-style:italic;}'
    + '.imgrid{display:grid;gap:5mm;margin:8px 0 14px;page-break-inside:auto;}'
    + '.imgrid.n1{grid-template-columns:1fr;}'
    + '.imgrid.n2{grid-template-columns:1fr 1fr;}'
    + '.imgrid.n3,.imgrid.n4{grid-template-columns:1fr 1fr;}'
    + '.imgrid.n5,.imgrid.n6{grid-template-columns:1fr 1fr 1fr;}'
    + '.imgrid .ph{break-inside:avoid;page-break-inside:avoid;}'
    + '.imgrid .ph img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:5px;border:.5pt solid var(--line);display:block;}'
    + '.imgrid .ph-cap{margin-top:3px;font-size:8pt;color:var(--muted);}'
    + '.imgrid .ph-num{font-weight:700;color:var(--accent);}'
    + '.check-list{display:grid;grid-template-columns:repeat(2,1fr);gap:3px 12px;margin:8px 0 14px;font-size:9.5pt;}'
    + '.check-list .ck{display:flex;align-items:center;gap:6px;padding:3px 0;}'
    + '.check-list .ck:before{content:"✓";color:var(--ok);font-weight:700;}'
    + '.uk-block{border-left:3pt solid var(--accent);padding:5px 12px 5px;margin:10px 0 14px;background:var(--tint);break-inside:avoid;page-break-inside:avoid;}'
    + '.uk-title{font-weight:700;font-size:10pt;color:var(--accent);margin-bottom:3px;text-transform:uppercase;letter-spacing:.04em;}'
    + '.mn-card{border:.75pt solid var(--line);border-left:3pt solid var(--accent);border-radius:0 5px 5px 0;padding:9px 13px;margin-bottom:10px;break-inside:avoid;page-break-inside:avoid;}'
    + '.mn-card.hoch{border-left-color:var(--red);}'
    + '.mn-card.mittel{border-left-color:var(--amber);}'
    + '.mn-card.niedrig{border-left-color:var(--accent);}'
    + '.mn-head{display:flex;align-items:center;gap:8px;margin-bottom:5px;}'
    + '.mn-title{font-weight:700;font-size:11pt;flex:1;}'
    + '.mn-prio{font-size:7.5pt;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:2px 7px;border-radius:3px;background:var(--tint);color:var(--ink-soft);}'
    + '.mn-prio.hoch{background:#fee2e2;color:#991b1b;}'
    + '.mn-prio.mittel{background:#fef3c7;color:#92400e;}'
    + '.mn-prio.niedrig{background:#dbeafe;color:#1e40af;}'
    + '.mn-label{font-size:7.5pt;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:700;margin:5px 0 1px;}'
    + '.mn-text{font-size:10pt;color:#000;}'
    + '.print-toolbar{position:fixed;top:12px;right:12px;z-index:9999;display:flex;gap:8px;}'
    + '.print-toolbar button{background:var(--accent);color:#fff;border:none;padding:9px 16px;border-radius:7px;cursor:pointer;font-weight:600;font-size:13px;font-family:\'DM Sans\',sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.15);}'
    + '.print-toolbar button.secondary{background:#fff;color:var(--ink);border:1px solid var(--line);}';

  // ── Eingebettetes GEMA-Logo ────────────────────────────────────────
  var GEMA_LOGO_SVG = '<svg class="brand-svg" xmlns="http://www.w3.org/2000/svg" viewBox="80 196 415 175" preserveAspectRatio="xMidYMid meet"><defs><clipPath id="dl_c1"><path d="M 29 17 L 145 17 L 145 151 L 29 151 Z"/></clipPath><clipPath id="dl_c2"><path d="M 58.367188 0.613281 L 173.855469 67.289062 L 116.105469 167.3125 L 0.621094 100.636719 Z"/></clipPath></defs><g transform="matrix(1,0,0,1,83,199)"><g clip-path="url(#dl_c1)"><g clip-path="url(#dl_c2)"><path fill="#0891b2" d="M 144.929688 50.640625 L 144.929688 117.292969 L 87.207031 150.617188 L 29.484375 117.292969 L 29.484375 50.640625 L 87.207031 17.3125 Z"/></g></g><path fill="#fff" d="M 98 73 C 96 71 94 70 91 69 C 85 75 85 75 84 77 C 90 77 95 82 94 88 C 93 92 84 100 77 107 C 73 111 67 111 64 107 C 60 104 60 98 64 94 L 72 86 C 71 82 71 78 72 75 L 57 90 C 51 97 51 107 57 114 C 64 121 74 121 81 114 L 98 97 C 105 90 105 80 98 73 Z"/></g></svg>';

  // ── Helpers ────────────────────────────────────────────────────────
  function esc(v){
    return String(v == null ? '' : v)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  // ── Firmenfarben (org.settings.pdfFarben) ──────────────────────────
  // Siehe gema_schaden_pdf.js fuer die ausfuehrliche Erklaerung. Kurz:
  // --accent (Text/Linien/Flaechen) + --forest (Verlauf-Tail) aus den
  // Firmenfarben ableiten. Eine Firmenfarbe wird Richtung Schwarz
  // abgedunkelt, bis der Kontrast gegen Weiss >= 4.5:1 ist — symmetrisch,
  // also gleichzeitig lesbar als Text auf Weiss UND als Flaeche unter
  // weisser Schrift. Gelb wird so zu dunklem Gold, nie zu gelber Schrift.
  function _hexToRgb(hex){
    hex = String(hex||'').trim().replace(/^#/,'');
    if(hex.length === 3) hex = hex.charAt(0)+hex.charAt(0)+hex.charAt(1)+hex.charAt(1)+hex.charAt(2)+hex.charAt(2);
    if(!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
    return { r:parseInt(hex.slice(0,2),16), g:parseInt(hex.slice(2,4),16), b:parseInt(hex.slice(4,6),16) };
  }
  function _rgbToHex(r,g,b){
    function h(n){ n = Math.max(0,Math.min(255,Math.round(n))); return (n<16?'0':'')+n.toString(16); }
    return '#'+h(r)+h(g)+h(b);
  }
  function _relLum(rgb){
    var a = [rgb.r,rgb.g,rgb.b].map(function(v){ v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); });
    return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2];
  }
  function _contrastVsWhite(rgb){ return (1.05)/(_relLum(rgb)+0.05); }
  function _darkenForWhiteBg(hex, target){
    var rgb = _hexToRgb(hex);
    if(!rgb) return null;
    if(_contrastVsWhite(rgb) >= target) return _rgbToHex(rgb.r,rgb.g,rgb.b);
    var f = 1.0;
    for(var i=0;i<40;i++){
      f -= 0.025;
      var c = { r:rgb.r*f, g:rgb.g*f, b:rgb.b*f };
      if(_contrastVsWhite(c) >= target) return _rgbToHex(c.r,c.g,c.b);
    }
    return '#1f2933';
  }
  function _lightTint(hex, whiteMix){
    var rgb = _hexToRgb(hex);
    if(!rgb) return null;
    var m = whiteMix == null ? 0.92 : whiteMix;
    return _rgbToHex(rgb.r + (255-rgb.r)*m, rgb.g + (255-rgb.g)*m, rgb.b + (255-rgb.b)*m);
  }
  function _brandRootCss(org){
    var pf = org && org.settings && org.settings.pdfFarben;
    if(!pf || !pf.primary) return '';
    var accent = _darkenForWhiteBg(pf.primary, 4.5);
    if(!accent) return '';
    var accentDeep = _darkenForWhiteBg(pf.primary, 7) || accent;
    var forest = pf.secondary ? (_darkenForWhiteBg(pf.secondary, 4.5) || accentDeep) : accentDeep;
    var tint = _lightTint(pf.primary) || '#ecfeff';
    return ':root{--accent:'+accent+';--accent-deep:'+accentDeep+';--forest:'+forest+';--tint-blue:'+tint+';}';
  }
  function fmtDate(iso){
    if(!iso) return '';
    var d = new Date(iso);
    if(isNaN(d.getTime())) return '';
    var p = function(n){return n<10?'0'+n:''+n;};
    return p(d.getDate())+'.'+p(d.getMonth()+1)+'.'+d.getFullYear();
  }
  function fmtDateTime(iso){
    var d = new Date(iso || Date.now());
    var p = function(n){return n<10?'0'+n:''+n;};
    return p(d.getDate())+'.'+p(d.getMonth()+1)+'.'+d.getFullYear()+', '+p(d.getHours())+':'+p(d.getMinutes())+' Uhr';
  }
  function notEmpty(v){ return v != null && String(v).trim() !== ''; }

  function brandHtml(org){
    // logoVector (SVG-Original) bevorzugen — rendert im Browser-Druck
    // gestochen scharf; org.logo ist nur das JPEG-Raster.
    var logoSrc = org && (org.logoVector || org.logo);
    if(logoSrc && /^data:image\//i.test(logoSrc)){
      return '<div class="brand"><img class="brand-logo-img" src="'+esc(logoSrc)+'" alt="'+esc(org.name||'')+'"></div>';
    }
    return '<div class="brand">'+GEMA_LOGO_SVG+'</div>';
  }
  function brandName(org){
    if(org && org.name) return esc(org.name);
    return 'GEMA';
  }

  // ── Bilder-Grid Renderer (mit 4/6 Seitenfüllung) ───────────────────
  // Regel: chunks zu max. 6 — jeder Chunk in eigenen Grid; bei mehreren
  // chunks startet jeder Chunk nach dem ersten auf einer neuen Seite
  // (via page-break-before:always).
  // Trennt einen Bilder-Pool in {haupt, rest}:
  //   - haupt: Bild mit hauptbild===true; oder erstes Foto wenn keins
  //     markiert ist UND mind. 2 Fotos vorhanden sind. Bei nur einem
  //     Foto wird es immer als haupt verwendet.
  //   - rest: alle uebrigen Fotos mit imBericht !== false.
  // Vom Bericht ausgeschlossene Fotos (imBericht === false) werden
  // weder als haupt noch als rest gerendert.
  // Bildquelle: Storage-URL bevorzugt, sonst Base64 (Backward-Compat).
  function imgSrc(b){ return (b && (b.url || b.dataUrl)) || ''; }
  function hasImg(b){ return !!(b && (b.url || b.dataUrl)); }
  function splitMainAndRest(bilder){
    var inReport = (bilder||[]).filter(function(b){
      return hasImg(b) && b.imBericht !== false;
    });
    if(!inReport.length) return { haupt:null, rest:[] };
    var hauptIdx = -1;
    for(var i=0; i<inReport.length; i++){
      if(inReport[i].hauptbild){ hauptIdx = i; break; }
    }
    // Kein explizit markiertes Hauptbild → erstes Foto als Haupt
    if(hauptIdx < 0) hauptIdx = 0;
    var haupt = inReport[hauptIdx];
    var rest = inReport.slice(0, hauptIdx).concat(inReport.slice(hauptIdx+1));
    return { haupt: haupt, rest: rest };
  }

  function gridHtml(bilder){
    // Akzeptiert sowohl bereits gefiltertes Array als auch rohes
    // Pool — filtert sicherheitshalber.
    bilder = (bilder||[]).filter(function(b){
      return hasImg(b) && b.imBericht !== false;
    });
    if(!bilder.length) return '';
    var html = '';
    for(var i = 0; i < bilder.length; i += 6){
      var chunk = bilder.slice(i, i+6);
      var pageBreak = (i > 0) ? ' style="page-break-before:always;"' : '';
      html += '<div class="imgrid n'+chunk.length+'"'+pageBreak+'>';
      chunk.forEach(function(b, idx){
        var num = (i + idx + 1) < 10 ? '0'+(i + idx + 1) : ''+(i + idx + 1);
        html += '<div class="ph">'
          + '<img src="'+esc(imgSrc(b))+'" alt="Foto '+num+'">';
        if(notEmpty(b.kommentar)){
          html += '<div class="ph-cap"><span class="ph-num">'+num+'</span> · '+esc(b.kommentar)+'</div>';
        } else {
          html += '<div class="ph-cap"><span class="ph-num">'+num+'</span></div>';
        }
        html += '</div>';
      });
      html += '</div>';
    }
    return html;
  }
  function bigImageHtml(bild){
    if(!hasImg(bild)) return '';
    var h = '<div class="bigimg"><img src="'+esc(imgSrc(bild))+'" alt="">';
    if(notEmpty(bild.kommentar)) h += '<div class="bigimg-cap">'+esc(bild.kommentar)+'</div>';
    h += '</div>';
    return h;
  }

  // ── Templates Lookup ───────────────────────────────────────────────
  function lookupTemplate(arr, id){
    return (arr||[]).find(function(x){ return x.id === id; });
  }

  // ── Cover ─────────────────────────────────────────────────────────
  function coverHtml(b, opts){
    var org = opts.org;
    var h = '<section class="cover">'
      + '<div class="cover-bar"></div>'
      + '<div class="cover-top">'+brandHtml(org)+'<div class="cover-doctype">Dachinspektion</div></div>'
      + '<div class="cover-hero">'
        + '<span class="cover-eyebrow">Spenglerei · Inspektionsbericht</span>'
        + '<h1 class="cover-title">'+esc(b.titel||'Dachinspektion')+'</h1>'
        + '<p class="cover-sub">Übersicht · Kapitel · Massnahmen</p>'
      + '</div>'
      + '<div class="cover-meta">';
    if(notEmpty(opts.objektName))    h += '<div class="meta-item"><div class="meta-k">Objekt</div><div class="meta-v">'+esc(opts.objektName)+'</div></div>';
    if(notEmpty(opts.objektAdresse)) h += '<div class="meta-item"><div class="meta-k">Adresse</div><div class="meta-v">'+esc(opts.objektAdresse)+'</div></div>';
    if(b.erstelltVon && notEmpty(b.erstelltVon.name))
                                      h += '<div class="meta-item"><div class="meta-k">Sachbearbeiter</div><div class="meta-v">'+esc(b.erstelltVon.name)+'</div></div>';
    if(b.erstelltAm)                  h += '<div class="meta-item"><div class="meta-k">Inspektion</div><div class="meta-v">'+esc(fmtDate(b.erstelltAm))+'</div></div>';
    var nMassn = (b.massnahmen||[]).length;
    if(nMassn)                        h += '<div class="meta-item"><div class="meta-k">Massnahmen</div><div class="meta-v">'+nMassn+'</div></div>';
    var nKapitel = (b.kapitel||[]).length;
    if(nKapitel)                      h += '<div class="meta-item"><div class="meta-k">Kapitel</div><div class="meta-v">'+nKapitel+'</div></div>';
    h += '</div>'
      + '<div class="cover-foot">Erstellt am '+esc(fmtDateTime(Date.now()))+' · '+brandName(org)+' Dachinspektion</div>'
      + '</section>';
    return h;
  }

  // ── 1. Dach-Übersicht ─────────────────────────────────────────────
  function uebersichtHtml(b, opts){
    var u = b.dachuebersicht || {};
    var bilder = u.bilder || (hasImg(u.bild) ? [u.bild] : []);
    var split = splitMainAndRest(bilder);
    if(!u.dachtyp && !u.ziegelart && !notEmpty(u.dachtypText) && !notEmpty(u.ziegelartText) && !notEmpty(u.bemerkung) && !split.haupt) return '';
    var tpl = opts.templates || {};
    // Label-Aufloesung: eingefrorenes Label im Bericht hat Vorrang vor
    // dem Template-Lookup. Dadurch sind aenderungen am Template (z.B.
    // Umbenennen, Loeschen) wirken NICHT mehr auf bestehende Berichte.
    // Fallback aufs Template gilt nur fuer Alt-Daten ohne gespeichertes Label.
    var dachtypLabel = u.dachtypLabel || '';
    if(!dachtypLabel){
      var dt = lookupTemplate(tpl.dachtypen, u.dachtyp);
      if(dt) dachtypLabel = dt.label;
    }
    if(u.dachtyp === 'kombination' && u.dachtypKombi && u.dachtypKombi.length){
      var parts = u.dachtypKombi.map(function(id, i){
        // Erst eingefrorenes Kombi-Label, dann Template-Fallback
        var frozen = (u.dachtypKombiLabels && u.dachtypKombiLabels[i]) || '';
        if(frozen) return frozen;
        var t = lookupTemplate(tpl.dachtypen, id);
        return t ? t.label : '';
      }).filter(Boolean);
      if(parts.length) dachtypLabel = 'Kombination: ' + parts.join(' + ');
    }
    var ziegelLabel = u.ziegelartLabel || '';
    if(!ziegelLabel){
      var zt = lookupTemplate(tpl.ziegelarten, u.ziegelart);
      if(zt) ziegelLabel = zt.label;
    }

    var h = '<section class="report-section"><div class="page-body">'
      + '<div class="sec-head"><div class="sec-num">1</div>'
      + '<div class="sec-titles"><div class="sec-eyebrow">Übersicht</div><div class="sec-title">Dachübersicht</div></div></div>';
    if(split.haupt) h += bigImageHtml(split.haupt);
    // Text auch dann rendern, wenn kein Label aufloesbar ist (Template-
    // Eintrag geloescht, kein eingefrorenes Label) — sonst ginge der
    // erfasste Beschreibungstext im PDF still verloren.
    if(dachtypLabel || notEmpty(u.dachtypText)){
      h += '<div class="block"><div class="block-label">Dachtyp'+(dachtypLabel?' · '+esc(dachtypLabel):'')+'</div>';
      if(notEmpty(u.dachtypText)) h += '<div class="block-body">'+esc(u.dachtypText)+'</div>';
      h += '</div>';
    }
    if(ziegelLabel || notEmpty(u.ziegelartText)){
      h += '<div class="block"><div class="block-label">Eindeckung'+(ziegelLabel?' · '+esc(ziegelLabel):'')+'</div>';
      if(notEmpty(u.ziegelartText)) h += '<div class="block-body">'+esc(u.ziegelartText)+'</div>';
      h += '</div>';
    }
    if(notEmpty(u.bemerkung)){
      h += '<div class="block"><div class="block-label">Bemerkung</div><div class="block-body">'+esc(u.bemerkung)+'</div></div>';
    }
    if(split.rest.length){
      h += '<div class="subhead">Weitere Fotos</div>';
      h += gridHtml(split.rest);
    }
    h += '</div></section>';
    return h;
  }

  // ── 2. Kapitel ────────────────────────────────────────────────────
  function kapitelHtml(b, opts){
    var kap = b.kapitel || [];
    if(!kap.length) return '';
    var tpl = opts.templates || {};
    var html = '';
    kap.forEach(function(k, ki){
      var kBilder = k.bilder || (hasImg(k.bildGross) ? [k.bildGross] : []);
      var split = splitMainAndRest(kBilder);
      // Nur rendern wenn irgendetwas drin
      var hasCont = notEmpty(k.name) || notEmpty(k.einleitung) || split.haupt
        || split.rest.length || (k.checkliste||[]).length || (k.unterkapitel||[]).length;
      if(!hasCont) return;
      html += '<section class="report-section"><div class="page-body">'
        + '<div class="sec-head"><div class="sec-num">'+(2+ki)+'</div>'
        + '<div class="sec-titles"><div class="sec-eyebrow">Kapitel '+(ki+1)+'</div><div class="sec-title">'+esc(k.name||'Unbenannt')+'</div></div></div>';
      if(split.haupt) html += bigImageHtml(split.haupt);
      if(notEmpty(k.einleitung)){
        html += '<div class="block"><div class="block-body">'+esc(k.einleitung)+'</div></div>';
      }
      // Restliche Fotos (Auto-Layout: 4 fuellen, 6 fuellen, >6 naechste Seite)
      if(split.rest.length){
        html += '<div class="subhead">Weitere Fotos</div>';
        html += gridHtml(split.rest);
      }
      // Checkliste
      if((k.checkliste||[]).length){
        html += '<div class="subhead-2">Auf dem Dach vorhanden</div>';
        html += '<div class="check-list">';
        k.checkliste.forEach(function(it){ html += '<div class="ck">'+esc(it)+'</div>'; });
        html += '</div>';
      }
      // Unterkapitel — kein Hauptbild, alle Fotos im Grid
      (k.unterkapitel||[]).forEach(function(uk){
        var label = uk.label || (lookupTemplate(tpl.unterkapitelTypen, uk.typ) && lookupTemplate(tpl.unterkapitelTypen, uk.typ).label) || uk.typ;
        var ukBilder = (uk.bilder||[]).filter(function(b){ return hasImg(b) && b.imBericht !== false; });
        var hasUkCont = notEmpty(uk.text) || ukBilder.length;
        if(!hasUkCont) return;
        html += '<div class="uk-block">'
          + '<div class="uk-title">'+esc(label)+'</div>';
        if(notEmpty(uk.text)) html += '<div class="block-body">'+esc(uk.text)+'</div>';
        html += '</div>';
        if(ukBilder.length) html += gridHtml(ukBilder);
      });
      html += '</div></section>';
    });
    return html;
  }

  // ── 3. Nachbaranschlüsse ──────────────────────────────────────────
  function nachbarHtml(b, opts){
    var n = b.nachbaranschluesse || {};
    var split = splitMainAndRest(n.bilder||[]);
    if(!notEmpty(n.text) && !split.haupt) return '';
    var nextNum = 2 + (b.kapitel||[]).length;
    var html = '<section class="report-section"><div class="page-body">'
      + '<div class="sec-head"><div class="sec-num">'+nextNum+'</div>'
      + '<div class="sec-titles"><div class="sec-eyebrow">Übergänge</div><div class="sec-title">Nachbaranschlüsse</div></div></div>';
    if(split.haupt) html += bigImageHtml(split.haupt);
    if(notEmpty(n.text)) html += '<div class="block"><div class="block-body">'+esc(n.text)+'</div></div>';
    if(split.rest.length){
      html += '<div class="subhead">Weitere Fotos</div>';
      html += gridHtml(split.rest);
    }
    html += '</div></section>';
    return html;
  }

  // ── 4. Maßnahmen ──────────────────────────────────────────────────
  function massnahmenHtml(b){
    var mn = b.massnahmen || [];
    if(!mn.length) return '';
    // Gleiche Render-Bedingung wie nachbarHtml (Text ODER mind. 1 im
    // Bericht enthaltenes Bild) — sonst Nummern-Luecke, wenn die Nachbar-
    // Bilder alle ausgeschlossen (imBericht===false) sind.
    var _nb = b.nachbaranschluesse || {};
    var _nbSplit = splitMainAndRest(_nb.bilder||[]);
    var nextNum = 2 + (b.kapitel||[]).length + ((notEmpty(_nb.text) || _nbSplit.haupt) ? 1 : 0);
    var html = '<section class="report-section"><div class="page-body">'
      + '<div class="sec-head"><div class="sec-num">'+nextNum+'</div>'
      + '<div class="sec-titles"><div class="sec-eyebrow">Empfehlungen</div><div class="sec-title">Massnahmen & Empfehlungen</div></div></div>';
    // Sortiere nach Prio: hoch > mittel > niedrig
    var order = { hoch:0, mittel:1, niedrig:2 };
    function _rank(p){ return (order[p] !== undefined) ? order[p] : 1; }
    // NICHT (order[x]||1): order['hoch']=0 ist falsy -> 'hoch' wuerde wie
    // 'mittel' gewichtet und nicht zuoberst sortiert.
    mn.slice().sort(function(a,b){
      return _rank(a.prioritaet) - _rank(b.prioritaet);
    }).forEach(function(m){
      var hasC = notEmpty(m.titel) || notEmpty(m.beschreibung) || notEmpty(m.empfehlung);
      if(!hasC) return;
      // Whitelist statt Roh-Wert im class-Attribut (Attribut-Breakout)
      var prio = (m.prioritaet==='hoch'||m.prioritaet==='niedrig') ? m.prioritaet : 'mittel';
      html += '<div class="mn-card '+prio+'">'
        + '<div class="mn-head">'
          + '<div class="mn-title">'+esc(m.titel||'Massnahme')+'</div>'
          + '<div class="mn-prio '+prio+'">'+esc(prio)+'</div>'
        + '</div>';
      if(notEmpty(m.beschreibung)){
        html += '<div class="mn-label">Mangel / Beschreibung</div>'
          + '<div class="mn-text">'+esc(m.beschreibung)+'</div>';
      }
      if(notEmpty(m.empfehlung)){
        html += '<div class="mn-label">Empfehlung</div>'
          + '<div class="mn-text">'+esc(m.empfehlung)+'</div>';
      }
      html += '</div>';
    });
    html += '</div></section>';
    return html;
  }

  // ── HTML zusammenbauen ────────────────────────────────────────────
  function buildHtml(b, opts){
    opts = opts || {};
    var titel = b.titel || 'Dachinspektion';
    var org = opts.org;
    var orgName = (org && org.name) ? org.name : 'GEMA';
    var datum = fmtDate(Date.now());
    // CSS-String-Escaper fuer die @page-Margin-Boxes. WICHTIG: neben
    // Backslash/Anfuehrungszeichen auch < > { } und Zeilenumbrueche
    // neutralisieren — ein '<' im Titel/Org-Namen konnte sonst den
    // <style>-Block verlassen (HTML-Injection im App-Origin, da das
    // Print-Fenster via window.open('') den Origin erbt), ein '}' brach
    // die @page-Regel, ein Newline machte den CSS-String ungueltig.
    function _cssStr(s){
      return String(s||'')
        .replace(/\\/g,'\\\\')
        .replace(/"/g,'\\"')
        .replace(/[<>{}\r\n]/g,' ');
    }
    var pageCss = '@media print{@page{size:A4;margin:14mm 0 14mm 0;'
      + '@top-left{content:"'+_cssStr(orgName)+'";font-family:\'DM Sans\',sans-serif;font-size:7.5pt;font-weight:600;letter-spacing:.04em;color:#525d66;padding:5mm 15mm 0;}'
      + '@top-right{content:"Dachbericht · '+_cssStr(titel)+'";font-family:\'DM Sans\',sans-serif;font-size:7.5pt;letter-spacing:.04em;color:#8a949c;padding:5mm 15mm 0;}'
      + '@bottom-left{content:"'+_cssStr(orgName)+' · Erstellt '+_cssStr(datum)+'";font-family:\'DM Sans\',sans-serif;font-size:7.5pt;letter-spacing:.04em;color:#8a949c;padding:0 15mm 4mm;}'
      + '@bottom-right{content:"Seite " counter(page) " von " counter(pages);font-family:\'DM Sans\',sans-serif;font-size:7.5pt;font-weight:600;letter-spacing:.04em;color:#525d66;padding:0 15mm 4mm;}'
      + '}}';

    return '<!doctype html><html lang="de"><head><meta charset="utf-8">'
      + '<title>Dachbericht — '+esc(titel)+'</title>'
      + '<style>'+REPORT_CSS+_brandRootCss(org)+pageCss+'</style>'
      + '</head><body>'
      + '<div class="print-toolbar no-print">'
        + '<button onclick="window.print()">Drucken / Als PDF speichern</button>'
        + '<button class="secondary" onclick="window.close()">Schliessen</button>'
      + '</div>'
      + '<div class="content">'
        + coverHtml(b, opts)
        + uebersichtHtml(b, opts)
        + kapitelHtml(b, opts)
        + nachbarHtml(b, opts)
        + massnahmenHtml(b)
      + '</div>'
      + '</body></html>';
  }

  function exportPrint(b, opts){
    if(!b) return;
    var html = buildHtml(b, opts || {});
    var win;
    try { win = window.open('', '_blank', 'width=900,height=1200'); } catch(e){}
    if(!win){
      var blob = new Blob([html], {type:'text/html'});
      var url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.addEventListener('load', function(){
      setTimeout(function(){ try{ win.focus(); }catch(e){} }, 100);
    });
  }

  w.GemaDachberichtPDF = {
    exportPrint: exportPrint,
    buildHtml: buildHtml
  };
})(typeof window !== 'undefined' ? window : this);
