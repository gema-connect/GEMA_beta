/* gema_schaden_pdf.js — HTML/Print-Export fuer Schadensberichte
 *
 * Generiert aus einem Schaden-Objekt eine A4-Druckseite nach Vorlage
 * `vorlagen/bericht_wasserschaden_vorlage.html` und oeffnet ein neues
 * Fenster mit window.print() — kein Backend noetig.
 *
 * Logo-Branching:
 *   - opts.org.logo vorhanden  → Org-Logo (Base64 data-URL aus sys_unternehmen)
 *   - sonst                    → eingebettetes GEMA-Logo (Inline-SVG)
 *
 * Aufruf: GemaSchadenPDF.exportPrint(schaden, opts)
 *   opts = { org, user, objektName, objektAdresse, kpis? }
 */
(function(w){
  'use strict';

  // ── CSS-Block aus der freigegebenen Vorlage (1:1 uebernommen) ──────
  // Quelle: vorlagen/bericht_wasserschaden_vorlage.html
  var REPORT_CSS = '@import url(\'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap\');'
    + ':root{--ink:#1f2933;--ink-soft:#525d66;--muted:#8a949c;--accent:#1e3a5f;--accent-deep:#142a45;--forest:#0c4a2e;--line:#e4e8ec;--line-soft:#eef1f3;--tint:#f5f7f8;--tint-blue:#eef2f6;--ok:#15803d;--paper:#ffffff;}'
    + '*{box-sizing:border-box;margin:0;padding:0;}'
    + 'html,body{font-family:\'DM Sans\',sans-serif;color:var(--ink);font-size:10.5pt;line-height:1.55;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-optical-sizing:none;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}'
    // ─ Bildschirm-Vorschau: jede Sektion als eigenes A4-Blatt mit Schatten,
    //   damit der User die Seitengrenzen visuell sieht (statt fortlaufender
    //   Strom). Cover + jede report-section ist ein eigenes Papier-Element.
    + '@media screen{body{background:#dfe3e6;padding:32px 16px;}'
      + '.content{width:210mm;margin:0 auto;background:transparent;}'
      + '.content > .cover,.content > .report-section{width:210mm;min-height:297mm;background:var(--paper);box-shadow:0 8px 40px rgba(20,30,45,.18);margin:0 auto 28px;position:relative;overflow:hidden;}'
      + '.content > .report-section{padding:0;}'
      + '.doc-header,.doc-footer{display:none;}'
    + '}'
    // ─ Druck/PDF: A4, Seitenumbrueche vor jeder report-section
    + '@media print{@page{size:A4;margin:0;}body{background:#fff;padding:0;}.content{width:auto;box-shadow:none;background:transparent;}'
      + '.content > .cover,.content > .report-section{box-shadow:none;margin:0;background:#fff;}'
      + '.report-section{page-break-before:always;}'
      + '.cover{page-break-after:always;}'
      + '.no-print{display:none!important;}'
    + '}'
    + '.content{position:relative;}'
    + '.doc-header,.doc-footer{position:fixed;left:0;right:0;font-size:7.5pt;letter-spacing:.04em;color:var(--muted);padding:0 15mm;}'
    + '.doc-header{top:0;height:16mm;display:flex;align-items:flex-end;justify-content:space-between;padding-bottom:5mm;border-bottom:.5pt solid var(--line);}'
    + '.doc-header .dh-mark{color:var(--accent);font-weight:700;letter-spacing:.14em;}'
    + '.doc-footer{bottom:0;height:14mm;display:flex;align-items:flex-start;justify-content:space-between;padding-top:4mm;border-top:.5pt solid var(--line);}'
    + '.page-body{padding:22mm 15mm 18mm;}'
    + '.cover{padding:0 15mm;min-height:297mm;display:flex;flex-direction:column;}'
    + '.cover-bar{height:5pt;margin:0 -15mm;background:linear-gradient(90deg,var(--accent) 0%,var(--accent) 62%,var(--forest) 100%);}'
    + '.cover-top{display:flex;justify-content:space-between;align-items:center;padding:14mm 0 0;}'
    + '.brand{display:flex;align-items:center;gap:9px;}'
    + '.brand-logo-img{max-height:36px;max-width:160px;width:auto;height:auto;display:block;}'
    + '.brand-svg{height:32px;width:auto;display:block;}'
    + '.brand-word{font-weight:700;font-size:15pt;letter-spacing:.16em;color:var(--ink);}'
    + '.cover-doctype{font-size:8pt;letter-spacing:.22em;text-transform:uppercase;color:var(--muted);font-weight:600;}'
    + '.cover-hero{margin-top:34mm;}'
    + '.cover-eyebrow{display:inline-block;font-size:8.5pt;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);font-weight:700;padding-bottom:4px;border-bottom:2pt solid var(--accent);margin-bottom:14px;}'
    + '.cover-title{font-size:33pt;line-height:1.12;font-weight:700;color:var(--ink);letter-spacing:-.01em;max-width:150mm;}'
    + '.cover-sub{margin-top:10px;font-size:11pt;color:var(--ink-soft);}'
    + '.status{display:inline-flex;align-items:center;gap:6px;margin-top:18px;font-size:8pt;font-weight:600;letter-spacing:.08em;text-transform:uppercase;padding:5px 11px;border-radius:4px;background:var(--tint);color:var(--ok);border:.75pt solid #cfe6d6;}'
    + '.status .dot{width:6px;height:6px;border-radius:50%;background:var(--ok);}'
    + '.cover-meta{margin-top:auto;padding-top:14mm;display:grid;grid-template-columns:1fr 1fr 1fr;gap:9mm 12mm;border-top:.75pt solid var(--line);}'
    + '.meta-k{font-size:7.5pt;letter-spacing:.13em;text-transform:uppercase;color:var(--muted);font-weight:600;margin-bottom:2px;}'
    + '.meta-v{font-size:10.5pt;color:var(--ink);font-weight:500;}'
    + '.meta-v.dim{color:var(--muted);font-weight:400;}'
    + '.kpi-strip{margin-top:9mm;display:grid;grid-template-columns:repeat(4,1fr);border:.75pt solid var(--line);border-radius:7px;overflow:hidden;}'
    + '.kpi{padding:11px 14px;border-right:.75pt solid var(--line);}'
    + '.kpi:last-child{border-right:none;}'
    + '.kpi-v{font-size:18pt;font-weight:700;color:var(--accent);line-height:1;}'
    + '.kpi-v small{font-size:9.5pt;font-weight:600;color:var(--ink-soft);}'
    + '.kpi-k{margin-top:5px;font-size:7.5pt;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:600;}'
    + '.cover-foot{margin-top:9mm;padding-bottom:14mm;font-size:8pt;color:var(--muted);letter-spacing:.03em;}'
    + '.sec-head{display:flex;align-items:center;gap:13px;border-bottom:1.5pt solid var(--accent);padding-bottom:9px;margin-bottom:20px;}'
    + '.sec-num{flex:0 0 auto;width:34px;height:34px;border-radius:6px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14pt;}'
    + '.sec-titles .sec-eyebrow{font-size:7.5pt;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);font-weight:600;}'
    + '.sec-titles .sec-title{font-size:16pt;font-weight:700;color:var(--ink);line-height:1.15;}'
    + '.sec-date{margin-left:auto;font-size:8pt;color:var(--muted);text-align:right;letter-spacing:.03em;}'
    + '.block{margin-bottom:15px;break-inside:avoid;page-break-inside:avoid;}'
    + '.block-label{font-size:8pt;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);font-weight:700;margin-bottom:3px;}'
    + '.block-body{color:var(--ink-soft);font-size:10.5pt;}'
    + '.block-body ul{list-style:none;margin-top:3px;}'
    + '.block-body li{position:relative;padding-left:15px;margin-bottom:2px;}'
    + '.block-body li::before{content:"";position:absolute;left:0;top:7px;width:5px;height:5px;border-radius:1px;background:var(--accent);}'
    + '.facts-row{display:flex;gap:0;margin-bottom:18px;border:.75pt solid var(--line);border-radius:6px;overflow:hidden;}'
    + '.facts-row .fact{flex:1;padding:9px 13px;border-right:.75pt solid var(--line);}'
    + '.facts-row .fact:last-child{border-right:none;}'
    + '.fact-k{font-size:7.5pt;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:600;}'
    + '.fact-v{font-size:11pt;font-weight:600;color:var(--ink);margin-top:2px;}'
    // ─ Subhead + Tabelle muessen zusammen bleiben (Header allein auf Seite = unsauber)
    + '.subhead{font-size:9pt;font-weight:700;color:var(--ink);letter-spacing:.02em;margin:18px 0 7px;break-after:avoid;page-break-after:avoid;}'
    + '.tbl-block{break-inside:avoid;page-break-inside:avoid;margin-bottom:6px;}'
    + '.tbl{width:100%;border-collapse:collapse;font-size:9.5pt;break-inside:avoid;page-break-inside:avoid;}'
    + '.tbl thead{display:table-header-group;}'
    + '.tbl tr{break-inside:avoid;page-break-inside:avoid;}'
    + '.tbl thead th{background:var(--tint);color:var(--ink-soft);font-size:7.5pt;letter-spacing:.07em;text-transform:uppercase;font-weight:600;text-align:left;padding:7px 10px;border-bottom:.75pt solid var(--line);}'
    + '.tbl tbody td{padding:7px 10px;border-bottom:.5pt solid var(--line-soft);color:var(--ink-soft);}'
    + '.tbl tbody tr:nth-child(even) td{background:#fafbfc;}'
    + '.tbl .num{text-align:right;font-variant-numeric:tabular-nums;}'
    + '.tbl td.lead{color:var(--ink);font-weight:500;}'
    + '.tbl tr.sum td{background:var(--tint-blue);color:var(--accent);font-weight:700;border-top:1.25pt solid var(--accent);border-bottom:none;}'
    + 'table{break-inside:avoid;page-break-inside:avoid;}'
    + '.chart-card{border:.75pt solid var(--line);border-radius:7px;padding:14px 14px 8px;margin:6px 0 4px;break-inside:avoid;page-break-inside:avoid;}'
    + '.chart-card svg{display:block;width:100%;height:auto;}'
    + '.chart-legend{display:flex;gap:18px;margin-top:4px;padding-left:2px;font-size:8pt;color:var(--ink-soft);flex-wrap:wrap;}'
    + '.chart-legend span{display:inline-flex;align-items:center;gap:6px;}'
    + '.chart-legend i{width:14px;height:2.5px;border-radius:2px;display:inline-block;}'
    // ─ Foto-Block (Head + Grid) als untrennbare Einheit. Foto-Gruppen
    //   sind durch .photo-group umschlossen — Head darf nicht alleine
    //   am Seitenende stehen.
    + '.photo-group{break-inside:avoid;page-break-inside:avoid;margin-top:14px;}'
    + '.photo-head{display:flex;align-items:baseline;gap:8px;margin:20px 0 9px;break-after:avoid;page-break-after:avoid;}'
    + '.photo-head .ph-title{font-size:9pt;font-weight:700;color:var(--ink);}'
    + '.photo-head .ph-count{font-size:7.5pt;color:#fff;background:var(--accent);padding:1px 7px;border-radius:9px;font-weight:600;}'
    + '.photos{display:grid;grid-template-columns:repeat(2,1fr);gap:9mm 6mm;}'
    + '.photos.cols-3{grid-template-columns:repeat(3,1fr);}'
    + '.photo{break-inside:avoid;}'
    + '.photo-frame{aspect-ratio:4/3;border:.75pt solid var(--line);border-radius:6px;background:var(--tint);overflow:hidden;position:relative;display:flex;align-items:center;justify-content:center;}'
    + '.photo-frame img{width:100%;height:100%;object-fit:cover;display:block;}'
    + '.photo-cap{margin-top:6px;display:flex;gap:7px;align-items:baseline;font-size:8pt;color:var(--muted);}'
    + '.photo-cap b{color:var(--accent);font-weight:700;font-size:7.5pt;letter-spacing:.04em;}'
    + '.note{background:var(--tint);border-left:3pt solid var(--accent);border-radius:0 6px 6px 0;padding:10px 14px;margin:14px 0;font-size:9.5pt;color:var(--ink-soft);break-inside:avoid;page-break-inside:avoid;}'
    + '.note .note-k{font-size:7.5pt;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);font-weight:700;margin-bottom:3px;}'
    // Unterschriften-CSS bleibt drin als Backward-Compat (falls externe
    // Aufrufer den Block wieder einfuegen wollen) — wird im Standardfall
    // nicht mehr generiert.
    + '.sign-row{display:flex;gap:14mm;margin-top:16mm;break-inside:avoid;page-break-inside:avoid;}'
    + '.sign{flex:1;}'
    + '.sign-line{border-top:.75pt solid var(--ink);padding-top:5px;}'
    + '.sign-line .sl-role{font-size:7.5pt;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:600;}'
    + '.sign-line .sl-name{font-size:9.5pt;color:var(--ink);font-weight:500;}'
    + '.print-toolbar{position:fixed;top:12px;right:12px;z-index:9999;display:flex;gap:8px;}'
    + '.print-toolbar button{background:var(--accent);color:#fff;border:none;padding:9px 16px;border-radius:7px;cursor:pointer;font-weight:600;font-size:13px;font-family:\'DM Sans\',sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.15);}'
    + '.print-toolbar button.secondary{background:#fff;color:var(--ink);border:1px solid var(--line);}';

  // ── Eingebettetes GEMA-Logo (Inline-SVG, vektorscharf) ─────────────
  var GEMA_LOGO_SVG = '<svg class="brand-svg" xmlns="http://www.w3.org/2000/svg" viewBox="80 196 415 175" preserveAspectRatio="xMidYMid meet"><defs><clipPath id="pdf_c1"><path d="M 29 17 L 145 17 L 145 151 L 29 151 Z" clip-rule="nonzero"/></clipPath><clipPath id="pdf_c2"><path d="M 58.367188 0.613281 L 173.855469 67.289062 L 116.105469 167.3125 L 0.621094 100.636719 Z" clip-rule="nonzero"/></clipPath><clipPath id="pdf_c3"><path d="M 73 47.414062 L 123.597656 47.414062 L 123.597656 98 L 73 98 Z" clip-rule="nonzero"/></clipPath><clipPath id="pdf_c4"><rect x="0" width="174" y="0" height="168"/></clipPath></defs><g transform="matrix(1,0,0,1,83,199)"><g clip-path="url(#pdf_c4)"><g clip-path="url(#pdf_c1)"><g clip-path="url(#pdf_c2)"><path fill="#1e3a5f" d="M 144.929688 50.640625 L 144.929688 117.292969 L 87.207031 150.617188 L 29.484375 117.292969 L 29.484375 50.640625 L 87.207031 17.3125 Z" fill-opacity="1" fill-rule="nonzero"/></g></g></g><path fill="#fff" d="M 98.042969 73.117188 C 96.210938 71.285156 93.945312 69.882812 91.488281 69.070312 C 85.503906 75.054688 85.019531 75.28125 84.257812 77.097656 C 90.328125 76.699219 95.191406 82.253906 93.839844 88.324219 C 93.011719 92.078125 84.535156 99.5 76.90625 107.300781 C 73.34375 110.933594 67.460938 110.898438 63.863281 107.300781 C 60.265625 103.703125 60.265625 97.855469 63.863281 94.257812 L 71.992188 86.128906 C 70.988281 82.390625 71.214844 78.445312 72.476562 74.933594 L 57.203125 90.210938 C 50.664062 96.75 50.664062 107.40625 57.203125 113.960938 C 63.757812 120.515625 74.378906 120.515625 80.953125 113.960938 L 98.042969 96.871094 C 104.550781 90.363281 104.652344 79.726562 98.042969 73.117188 Z"/><g clip-path="url(#pdf_c3)"><path fill="#fff" d="M 118.835938 76.078125 C 122.003906 72.910156 123.75 68.691406 123.75 64.210938 C 123.75 54.9375 116.242188 47.414062 106.953125 47.414062 C 102.472656 47.414062 98.253906 49.160156 95.085938 52.324219 C 90.8125 56.597656 82.269531 65.144531 77.996094 69.417969 C 71.507812 75.902344 71.371094 86.542969 77.996094 93.167969 C 79.828125 95 82.09375 96.402344 84.550781 97.214844 C 90.503906 91.265625 91.019531 91.023438 91.78125 89.1875 C 89.152344 89.363281 86.574219 88.410156 84.671875 86.507812 C 81.039062 82.875 81.109375 77.027344 84.671875 73.464844 C 87.855469 70.28125 95.882812 62.253906 99.132812 59.003906 C 102.734375 55.402344 108.578125 55.386719 112.179688 59.003906 C 115.777344 62.601562 115.777344 68.449219 112.179688 72.046875 L 104.046875 80.175781 C 105.066406 84.015625 104.824219 87.890625 103.5625 91.367188 Z"/></g></g></g><g fill="#1e3a5f"><g transform="translate(243.214799,313.539633)"><path d="M 62.46875 -35.8125 L 62.46875 -21.9375 C 60.8125 -14.34375 57.191406 -8.59375 51.609375 -4.6875 C 46.035156 -0.789062 39.8125 1.15625 32.9375 1.15625 C 24.3125 1.15625 16.960938 -2.070312 10.890625 -8.53125 C 4.816406 -14.988281 1.78125 -22.789062 1.78125 -31.9375 C 1.78125 -41.226562 4.75 -49.078125 10.6875 -55.484375 C 16.632812 -61.890625 24.050781 -65.09375 32.9375 -65.09375 C 43.320312 -65.09375 51.535156 -61.453125 57.578125 -54.171875 L 48.046875 -43.703125 C 44.640625 -49.179688 39.890625 -51.921875 33.796875 -51.921875 C 29.296875 -51.921875 25.457031 -49.96875 22.28125 -46.0625 C 19.101562 -42.164062 17.515625 -37.457031 17.515625 -31.9375 C 17.515625 -26.507812 19.101562 -21.867188 22.28125 -18.015625 C 25.457031 -14.171875 29.296875 -12.25 33.796875 -12.25 C 37.515625 -12.25 40.753906 -13.367188 43.515625 -15.609375 C 46.273438 -17.859375 47.65625 -20.84375 47.65625 -24.5625 L 32.9375 -24.5625 L 32.9375 -35.8125 Z"/></g><g transform="translate(307.462326,313.539633)"><path d="M 41.234375 -63.9375 L 41.234375 -51.15625 L 19.21875 -51.15625 L 19.21875 -38.4375 L 40.296875 -38.4375 L 40.296875 -25.65625 L 19.21875 -25.65625 L 19.21875 -12.78125 L 41.234375 -12.78125 L 41.234375 0 L 4.65625 0 L 4.65625 -63.9375 Z"/></g><g transform="translate(352.412344,313.539633)"><path d="M 57.5 0 L 54.484375 -37.890625 L 54.09375 -37.890625 L 41 -0.390625 L 32.3125 -0.390625 L 19.21875 -37.890625 L 18.828125 -37.890625 L 15.8125 0 L 1.234375 0 L 6.96875 -63.9375 L 22.46875 -63.9375 L 36.65625 -27.046875 L 50.84375 -63.9375 L 66.34375 -63.9375 L 72.078125 0 Z"/></g><g transform="translate(425.727374,313.539633)"><path d="M 37.125 -63.9375 L 62.9375 0 L 47.28125 0 L 42.546875 -12.78125 L 18.21875 -12.78125 L 13.484375 0 L -2.171875 0 L 23.640625 -63.9375 Z M 37.59375 -25.578125 L 30.453125 -44.171875 L 30.296875 -44.171875 L 23.171875 -25.578125 Z"/></g></g></svg>';

  // ── Utility ─────────────────────────────────────────────────────────
  function esc(v){
    return String(v == null ? '' : v)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function fmtDate(iso){
    if(!iso) return '';
    var d = new Date(iso);
    if(isNaN(d.getTime())) return '';
    var pad = function(n){return n<10?'0'+n:''+n;};
    return pad(d.getDate())+'.'+pad(d.getMonth()+1)+'.'+d.getFullYear();
  }
  function fmtDateTime(iso){
    var d = new Date(iso || Date.now());
    var pad = function(n){return n<10?'0'+n:''+n;};
    return pad(d.getDate())+'.'+pad(d.getMonth()+1)+'.'+d.getFullYear()+', '+pad(d.getHours())+':'+pad(d.getMinutes())+' Uhr';
  }
  function daysBetween(a, b){
    if(!a || !b) return 0;
    var t = (new Date(b) - new Date(a)) / 86400000;
    return Math.max(0, Math.round(t));
  }

  // Pruef ob ein Wert "leer" ist (null/undef/''/whitespace-only).
  // Wird ueberall benutzt, wo Felder bei leerem Inhalt komplett aus
  // dem Bericht ausgeblendet werden sollen.
  function notEmpty(v){
    return v != null && String(v).trim() !== '';
  }

  // Schadens-Typ → lesbares Label + Eyebrow-Farbe
  var TYP_LABEL = {
    wasserschaden:'Wasserschaden', schimmel:'Schimmelschaden',
    rohrbruch:'Rohrbruch', leitungsschaden:'Leitungsschaden',
    rueckstau:'Rückstau', sonstiges:'Sonstiges'
  };
  function typLabel(t){ return TYP_LABEL[t] || 'Schadensbericht'; }

  // Phase-Status → Status-Pill Text
  var PHASE_LABEL = {
    erfasst:'Erfasst', analyse:'In Analyse',
    trocknung:'In Trocknung', abschluss:'Abschluss'
  };

  // kWh / Stunden — Logik gespiegelt aus sd_schadensbericht.html
  function computeKwh(g){
    if(!g) return null;
    var typ = g.zaehlerTyp || 'stunden';
    if(typ === 'kein') return null;
    if(g.zaehlerEnde == null || g.zaehlerEnde === '') return null;
    var diff = (parseFloat(g.zaehlerEnde)||0) - (parseFloat(g.zaehlerStart)||0);
    if(diff < 0) diff = 0;
    if(typ === 'kwh') return diff;
    if(!g.kw) return null;
    return diff * parseFloat(g.kw);
  }
  function computeHours(g){
    if(!g) return null;
    var typ = g.zaehlerTyp || 'stunden';
    if(typ !== 'stunden') return null;
    if(g.zaehlerEnde == null || g.zaehlerEnde === '') return null;
    var diff = (parseFloat(g.zaehlerEnde)||0) - (parseFloat(g.zaehlerStart)||0);
    return diff < 0 ? 0 : diff;
  }

  // ── Logo-Branch: Org-Logo oder eingebettetes GEMA-SVG ──────────────
  function brandHtml(org){
    if(org && org.logo && /^data:image\//i.test(org.logo)){
      return '<div class="brand">'
        + '<img class="brand-logo-img" src="'+esc(org.logo)+'" alt="'+esc(org.name||'')+'">'
        + '</div>';
    }
    // Kein Logo hochgeladen → eingebettetes GEMA-Logo
    return '<div class="brand">'+GEMA_LOGO_SVG+'</div>';
  }
  function brandName(org){
    if(org && org.name) return esc(org.name);
    return 'GEMA';
  }

  // ── Foto-Block (filtert imBericht !== false) ───────────────────────
  function photoSectionHtml(title, fotos){
    var inReport = (fotos||[]).filter(function(f){ return f && f.imBericht !== false && f.dataUrl; });
    if(!inReport.length) return '';
    // Bei mehr als 6 Fotos lohnt sich der Wrapper-Schutz nicht (zu gross
    // fuer eine Seite). Sonst: photo-group umschliesst Head + Grid, damit
    // der Head nicht alleine am Seitenende stehen bleibt.
    var wrapAll = inReport.length <= 6;
    var h = wrapAll ? '<div class="photo-group">' : '';
    h += '<div class="photo-head">'
      + '<span class="ph-title">'+esc(title)+'</span>'
      + '<span class="ph-count">'+inReport.length+'</span>'
      + '</div>';
    var cls = inReport.length > 4 ? 'photos cols-3' : 'photos';
    h += '<div class="'+cls+'">';
    inReport.forEach(function(f, i){
      var num = (i+1) < 10 ? '0'+(i+1) : ''+(i+1);
      h += '<div class="photo">'
        + '<div class="photo-frame"><img src="'+esc(f.dataUrl)+'" alt="Foto '+num+'"></div>'
        + '<div class="photo-cap"><b>'+num+'</b><span>'+esc(f.kommentar||'')+'</span></div>'
        + '</div>';
    });
    h += '</div>';
    if(wrapAll) h += '</div>';
    return h;
  }

  // ── Messpunkt-Trend SVG (auto-Skala) ───────────────────────────────
  function chartSvg(messpunkte){
    // Sammle alle Datums + Werte
    var allDates = {};
    var series = [];
    (messpunkte||[]).forEach(function(mp, idx){
      if(!mp.messungen || !mp.messungen.length) return;
      var pts = [];
      mp.messungen.forEach(function(m){
        if(m && m.datum && m.wert != null && m.wert !== ''){
          var v = parseFloat(m.wert);
          if(!isNaN(v)){
            pts.push({d:m.datum, v:v});
            allDates[m.datum] = true;
          }
        }
      });
      if(pts.length) series.push({ name: mp.name || ('Messpunkt '+(idx+1)), pts: pts });
    });
    if(!series.length) return '';

    // Wenn nur 1 Messung insgesamt: kein sinnvolles Diagramm
    var totalPts = 0;
    series.forEach(function(s){ totalPts += s.pts.length; });
    if(totalPts < 2) return '';

    var dates = Object.keys(allDates).sort();
    var minV = Infinity, maxV = -Infinity;
    series.forEach(function(s){
      s.pts.forEach(function(p){
        if(p.v < minV) minV = p.v;
        if(p.v > maxV) maxV = p.v;
      });
    });
    // Padding um die Skala
    var span = maxV - minV;
    if(span < 1) span = 1;
    var yMin = Math.floor((minV - span*0.1) / 5) * 5;
    var yMax = Math.ceil((maxV + span*0.1) / 5) * 5;
    if(yMin === yMax) yMax = yMin + 10;

    var X0 = 70, X1 = 640, Y0 = 40, Y1 = 240;
    function px(d){
      var i = dates.indexOf(d);
      if(dates.length === 1) return (X0+X1)/2;
      return X0 + (X1-X0) * (i/(dates.length-1));
    }
    function py(v){
      return Y1 - (Y1-Y0) * ((v-yMin)/(yMax-yMin));
    }

    var colors = ['#1e3a5f','#9aa6b0','#0c4a2e','#b45309','#7c3aed'];
    var dashes = ['','5 4','3 2','7 3','2 3'];

    var svg = '<svg viewBox="0 0 680 300" xmlns="http://www.w3.org/2000/svg">';
    // Gitter (5 Linien)
    svg += '<g stroke="#e4e8ec" stroke-width="1">';
    for(var i=0; i<5; i++){
      var y = Y0 + (Y1-Y0) * (i/4);
      svg += '<line x1="'+X0+'" y1="'+y+'" x2="'+X1+'" y2="'+y+'"/>';
    }
    svg += '</g>';
    // Achsen
    svg += '<line x1="'+X0+'" y1="'+Y0+'" x2="'+X0+'" y2="'+Y1+'" stroke="#aab3ba" stroke-width="1.2"/>';
    svg += '<line x1="'+X0+'" y1="'+Y1+'" x2="'+X1+'" y2="'+Y1+'" stroke="#aab3ba" stroke-width="1.2"/>';
    // Y-Labels
    svg += '<g fill="#8a949c" font-size="11" font-family="DM Sans" text-anchor="end">';
    for(var j=0; j<5; j++){
      var yv = yMax - (yMax-yMin) * (j/4);
      var yp = Y0 + (Y1-Y0) * (j/4) + 4;
      svg += '<text x="60" y="'+yp+'">'+Math.round(yv)+'</text>';
    }
    svg += '</g>';
    // X-Labels (max 5)
    var step = Math.max(1, Math.ceil(dates.length / 5));
    svg += '<g fill="#8a949c" font-size="11" font-family="DM Sans" text-anchor="middle">';
    for(var k=0; k<dates.length; k+=step){
      svg += '<text x="'+px(dates[k])+'" y="'+(Y1+22)+'">'+esc(fmtDate(dates[k]).slice(0,5))+'</text>';
    }
    if((dates.length-1) % step !== 0){
      svg += '<text x="'+px(dates[dates.length-1])+'" y="'+(Y1+22)+'">'+esc(fmtDate(dates[dates.length-1]).slice(0,5))+'</text>';
    }
    svg += '</g>';
    svg += '<text x="22" y="145" fill="#8a949c" font-size="10" font-family="DM Sans" transform="rotate(-90 22 145)" text-anchor="middle">Wert (Digits)</text>';
    // Series
    series.forEach(function(s, idx){
      var color = colors[idx % colors.length];
      var dash = dashes[idx % dashes.length];
      var sorted = s.pts.slice().sort(function(a,b){ return a.d < b.d ? -1 : 1; });
      var points = sorted.map(function(p){ return px(p.d)+','+py(p.v); }).join(' ');
      svg += '<polyline points="'+points+'" fill="none" stroke="'+color+'" stroke-width="2.4"'+(dash?' stroke-dasharray="'+dash+'"':'')+' stroke-linejoin="round" stroke-linecap="round"/>';
      svg += '<g fill="'+color+'">';
      sorted.forEach(function(p){
        svg += '<circle cx="'+px(p.d)+'" cy="'+py(p.v)+'" r="3.6"/>';
      });
      svg += '</g>';
    });
    svg += '</svg>';

    // Legende
    var legend = '<div class="chart-legend">';
    series.forEach(function(s, idx){
      var color = colors[idx % colors.length];
      legend += '<span><i style="background:'+color+'"></i> '+esc(s.name)+'</span>';
    });
    legend += '</div>';

    return '<div class="chart-card">'+svg+legend+'</div>';
  }

  // ── Cover-Seite ────────────────────────────────────────────────────
  function coverHtml(s, opts){
    var org = opts.org;
    var typ = typLabel(s.typ);

    // Status-Pill: bei Phase 'abschluss' und vorhandenem abgeschlossenAm
    var statusLabel = PHASE_LABEL[s.phase] || 'In Bearbeitung';
    var statusOk = s.abschluss && s.abschluss.abgeschlossenAm;
    var statusColor = statusOk ? 'var(--ok)' : 'var(--accent)';
    var statusBg    = statusOk ? 'var(--tint)' : 'var(--tint-blue)';
    var statusBrd   = statusOk ? '#cfe6d6'     : '#c5d2e3';

    // KPIs aus Trocknung
    var tr = s.trocknung || {};
    var tage = daysBetween(tr.gestartetAm, tr.beendetAm);
    var anzGeraete = (tr.geraete||[]).length;
    var anzMesspunkte = (tr.messpunkte||[]).length;
    var energieTotal = 0;
    (tr.geraete||[]).forEach(function(g){
      var k = computeKwh(g);
      if(k != null) energieTotal += k;
    });

    var h = '<section class="cover">'
      + '<div class="cover-bar"></div>'
      + '<div class="cover-top">'
        + brandHtml(org)
        + '<div class="cover-doctype">Schadensbericht</div>'
      + '</div>'
      + '<div class="cover-hero">'
        + '<span class="cover-eyebrow">'+esc(typ)+'</span>'
        + '<h1 class="cover-title">'+esc(s.titel || typ)+'</h1>'
        + '<p class="cover-sub">Zustandsanalyse · Trocknung · Abschlussbericht</p>'
        + '<div class="status" style="color:'+statusColor+';background:'+statusBg+';border-color:'+statusBrd+'">'
          + '<span class="dot" style="background:'+statusColor+'"></span> '+esc(statusLabel)
        + '</div>'
      + '</div>'
      + '<div class="cover-meta">';

    // Cover-Meta: nur Felder mit Inhalt anzeigen (leere weglassen).
    if(notEmpty(opts.objektName)){
      h += '<div class="meta-item"><div class="meta-k">Objekt</div><div class="meta-v">'+esc(opts.objektName)+'</div></div>';
    }
    if(notEmpty(opts.objektAdresse)){
      h += '<div class="meta-item"><div class="meta-k">Adresse</div><div class="meta-v">'+esc(opts.objektAdresse)+'</div></div>';
    }
    if(s.erstelltVon && notEmpty(s.erstelltVon.name)){
      h += '<div class="meta-item"><div class="meta-k">Sachbearbeiter</div><div class="meta-v">'+esc(s.erstelltVon.name)+'</div></div>';
    }
    h += '<div class="meta-item"><div class="meta-k">Schadentyp</div><div class="meta-v">'+esc(typ)+'</div></div>';
    if(s.erstelltAm){
      h += '<div class="meta-item"><div class="meta-k">Erfasst am</div><div class="meta-v">'+esc(fmtDate(s.erstelltAm))+'</div></div>';
    }
    var raeume = (s.raeume||[]).filter(notEmpty);
    if(raeume.length){
      h += '<div class="meta-item"><div class="meta-k">Betroffene Räume</div><div class="meta-v">'+esc(raeume.join(' · '))+'</div></div>';
    }
    h += '</div>';  // /cover-meta

    // KPIs nur wenn Trocknung Daten hat
    if(tage > 0 || anzGeraete > 0 || anzMesspunkte > 0){
      h += '<div class="kpi-strip">'
        + '<div class="kpi"><div class="kpi-v">'+tage+'<small> Tage</small></div><div class="kpi-k">Trocknungsdauer</div></div>'
        + '<div class="kpi"><div class="kpi-v">'+anzGeraete+'</div><div class="kpi-k">Geräte im Einsatz</div></div>'
        + '<div class="kpi"><div class="kpi-v">'+(Math.round(energieTotal*10)/10)+'<small> kWh</small></div><div class="kpi-k">Energiebedarf</div></div>'
        + '<div class="kpi"><div class="kpi-v">'+anzMesspunkte+'</div><div class="kpi-k">Messpunkte</div></div>'
      + '</div>';
    }

    h += '<div class="cover-foot">Erstellt am '+esc(fmtDateTime(Date.now()))+' · '+brandName(org)+' Schadensmanagement</div>'
      + '</section>';
    return h;
  }

  // ── Sektion 1: Zustandsanalyse ─────────────────────────────────────
  function analyseHtml(s){
    var a = s.zustandsanalyse || {};
    var massnahmenList = (a.massnahmen||[]).filter(notEmpty);
    var hasContent = notEmpty(a.leckortung) || notEmpty(a.schadenausmass)
      || massnahmenList.length || (a.fotos||[]).length;
    if(!hasContent) return '';
    var h = '<section class="report-section"><div class="page-body">'
      + '<div class="sec-head">'
        + '<div class="sec-num">1</div>'
        + '<div class="sec-titles"><div class="sec-eyebrow">Phase 1 von 3</div><div class="sec-title">Zustandsanalyse</div></div>'
        + (a.abgeschlossenAm ? '<div class="sec-date">Abgeschlossen<br>'+esc(fmtDate(a.abgeschlossenAm))+'</div>' : '')
      + '</div>';
    if(notEmpty(a.leckortung)){
      h += '<div class="block"><div class="block-label">Leckortung</div><div class="block-body">'+esc(a.leckortung)+'</div></div>';
    }
    if(notEmpty(a.schadenausmass)){
      h += '<div class="block"><div class="block-label">Schadenausmass</div><div class="block-body">'+esc(a.schadenausmass)+'</div></div>';
    }
    if(massnahmenList.length){
      h += '<div class="block"><div class="block-label">Massnahmen</div><div class="block-body"><ul>';
      massnahmenList.forEach(function(m){ h += '<li>'+esc(m)+'</li>'; });
      h += '</ul></div></div>';
    }
    h += photoSectionHtml('Analyse-Fotos', a.fotos);
    h += '</div></section>';
    return h;
  }

  // ── Sektion 2: Trocknung ───────────────────────────────────────────
  function trocknungHtml(s){
    var tr = s.trocknung || {};
    var hasContent = tr.gestartetAm || tr.beendetAm || (tr.geraete||[]).length || (tr.messpunkte||[]).length || tr.notizen || (tr.fotos||[]).length;
    if(!hasContent) return '';

    var tage = daysBetween(tr.gestartetAm, tr.beendetAm);
    var energieTotal = 0;
    (tr.geraete||[]).forEach(function(g){
      var k = computeKwh(g);
      if(k != null) energieTotal += k;
    });

    var dateRange = '';
    if(tr.gestartetAm && tr.beendetAm) dateRange = fmtDate(tr.gestartetAm).slice(0,5)+'–'+fmtDate(tr.beendetAm);
    else if(tr.gestartetAm) dateRange = 'Seit '+fmtDate(tr.gestartetAm);

    var h = '<section class="report-section"><div class="page-body">'
      + '<div class="sec-head">'
        + '<div class="sec-num">2</div>'
        + '<div class="sec-titles"><div class="sec-eyebrow">Phase 2 von 3</div><div class="sec-title">Trocknung</div></div>'
        + (dateRange ? '<div class="sec-date">'+(tage?tage+' Tage<br>':'')+esc(dateRange)+'</div>' : '')
      + '</div>';

    if(tr.gestartetAm || tr.beendetAm || tage || energieTotal){
      h += '<div class="facts-row">'
        + '<div class="fact"><div class="fact-k">Gestartet</div><div class="fact-v">'+esc(fmtDate(tr.gestartetAm)||'—')+'</div></div>'
        + '<div class="fact"><div class="fact-k">Beendet</div><div class="fact-v">'+esc(fmtDate(tr.beendetAm)||'—')+'</div></div>'
        + '<div class="fact"><div class="fact-k">Dauer</div><div class="fact-v">'+(tage||'—')+' Tage</div></div>'
        + '<div class="fact"><div class="fact-k">Energie total</div><div class="fact-v">'+(Math.round(energieTotal*10)/10)+' kWh</div></div>'
      + '</div>';
    }

    // Geraete-Tabelle — Subhead + Tabelle in einem .tbl-block (untrennbar)
    if((tr.geraete||[]).length){
      h += '<div class="tbl-block">'
        + '<div class="subhead">Eingesetzte Geräte</div>'
        + '<table class="tbl"><thead><tr>'
          + '<th>Gerät</th><th>Raum</th>'
          + '<th class="num">Leistung</th><th class="num">Std/Tag</th>'
          + '<th class="num">Tage</th><th class="num">Energie</th>'
        + '</tr></thead><tbody>';
      tr.geraete.forEach(function(g){
        var hours = computeHours(g);
        var kwh = computeKwh(g);
        var t = (g.tage != null) ? g.tage : daysBetween(tr.gestartetAm, tr.beendetAm);
        var stdTag = (hours != null && t > 0) ? (hours/t).toFixed(1) : (hours != null ? hours.toFixed(1) : '—');
        h += '<tr>'
          + '<td class="lead">'+esc(g.name||'—')+'</td>'
          + '<td>'+esc(g.raum||'—')+'</td>'
          + '<td class="num">'+(g.kw ? (parseFloat(g.kw).toFixed(2)+' kW') : '—')+'</td>'
          + '<td class="num">'+stdTag+' h</td>'
          + '<td class="num">'+(t||'—')+'</td>'
          + '<td class="num">'+(kwh != null ? (Math.round(kwh*10)/10)+' kWh' : '—')+'</td>'
        + '</tr>';
      });
      h += '</tbody></table></div>';  // /tbl-block

      // Summe pro Raum — eigener tbl-block
      var raumAgg = {};
      tr.geraete.forEach(function(g){
        var rm = g.raum || 'Ohne Raum';
        if(!raumAgg[rm]) raumAgg[rm] = { anz:0, h:0, kwh:0, tage:0 };
        raumAgg[rm].anz += 1;
        var hh = computeHours(g);
        var kk = computeKwh(g);
        if(hh != null) raumAgg[rm].h += hh;
        if(kk != null) raumAgg[rm].kwh += kk;
        var t = (g.tage != null) ? g.tage : daysBetween(tr.gestartetAm, tr.beendetAm);
        if(t > raumAgg[rm].tage) raumAgg[rm].tage = t;
      });
      var totH = 0, totKwh = 0, totAnz = 0;
      h += '<div class="tbl-block">'
        + '<div class="subhead">Zusammenfassung pro Raum</div>'
        + '<table class="tbl"><thead><tr>'
          + '<th>Raum</th><th class="num">Geräte</th><th class="num">Tage</th><th class="num">Stunden</th><th class="num">Energie</th>'
        + '</tr></thead><tbody>';
      Object.keys(raumAgg).forEach(function(rm){
        var a = raumAgg[rm];
        totH += a.h; totKwh += a.kwh; totAnz += a.anz;
        h += '<tr>'
          + '<td class="lead">'+esc(rm)+'</td>'
          + '<td class="num">'+a.anz+'</td>'
          + '<td class="num">'+(a.tage||'—')+'</td>'
          + '<td class="num">'+(a.h?a.h.toFixed(1):'—')+' h</td>'
          + '<td class="num">'+(Math.round(a.kwh*10)/10)+' kWh</td>'
        + '</tr>';
      });
      h += '<tr class="sum"><td>Total</td><td class="num">'+totAnz+'</td><td class="num">—</td><td class="num">'+(totH?totH.toFixed(1):'—')+' h</td><td class="num">'+(Math.round(totKwh*10)/10)+' kWh</td></tr>';
      h += '</tbody></table></div>';  // /tbl-block
    }

    // Messpunkt-Trend
    if((tr.messpunkte||[]).length){
      var chart = chartSvg(tr.messpunkte);
      if(chart){
        // Chart-Card-Block: Subhead + Chart untrennbar
        h += '<div class="tbl-block"><div class="subhead">Messpunkt-Trend</div>'+chart+'</div>';
      }
      // Messwert-Tabellen — jeder Messpunkt eigener .tbl-block
      tr.messpunkte.forEach(function(mp){
        if(!mp.messungen || !mp.messungen.length) return;
        var sorted = mp.messungen.slice().sort(function(a,b){ return a.datum < b.datum ? -1 : 1; });
        var vals = sorted.map(function(m){ return parseFloat(m.wert); }).filter(function(v){ return !isNaN(v); });
        if(!vals.length) return;
        var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
        var diff = sorted[sorted.length-1].wert - sorted[0].wert;
        var diffStr = (diff > 0 ? '+' : '') + diff.toFixed(1);
        h += '<div class="tbl-block">'
          + '<div class="subhead">'+esc(mp.name||'Messpunkt')+' <span style="color:var(--muted);font-weight:400">(min '+mn+' · max '+mx+' · Diff '+diffStr+' Digits)</span></div>'
          + '<table class="tbl"><thead><tr><th>Datum</th><th class="num">Wert</th><th class="num">Differenz</th><th>Trend</th></tr></thead><tbody>';
        var prev = null;
        sorted.forEach(function(m, i){
          var v = parseFloat(m.wert);
          var d = (i === 0) ? '—' : (v - prev).toFixed(1);
          var trend = (i === 0) ? 'Ausgangswert' : ((v - prev) < 0 ? 'fallend' : ((v - prev) > 0 ? 'steigend' : 'unveraendert'));
          h += '<tr><td class="lead">'+esc(fmtDate(m.datum))+'</td>'
            + '<td class="num">'+v+' Digits</td>'
            + '<td class="num">'+d+'</td>'
            + '<td>'+trend+'</td></tr>';
          prev = v;
        });
        h += '</tbody></table></div>';
      });
    }

    // Bemerkung zur Trocknung (frueher 'Notizen zur Trocknung') — nur
    // anzeigen wenn der User wirklich Inhalt eingegeben hat, nicht bei
    // leerem oder Whitespace-only-Feld.
    if(notEmpty(tr.notizen)){
      h += '<div class="note"><div class="note-k">Bemerkung zur Trocknung</div>'+esc(tr.notizen)+'</div>';
    }
    h += photoSectionHtml('Trocknungs-Fotos', tr.fotos);
    h += '</div></section>';
    return h;
  }

  // ── Sektion 3: Abschluss ───────────────────────────────────────────
  function abschlussHtml(s, opts){
    var ab = s.abschluss || {};
    var hasContent = notEmpty(ab.zusammenfassung) || notEmpty(ab.instandstellung)
      || notEmpty(ab.weitereSchaeden) || (ab.fotos||[]).length;
    if(!hasContent) return '';
    var h = '<section class="report-section"><div class="page-body">'
      + '<div class="sec-head">'
        + '<div class="sec-num">3</div>'
        + '<div class="sec-titles"><div class="sec-eyebrow">Phase 3 von 3</div><div class="sec-title">Abschlussbericht</div></div>'
        + (ab.abgeschlossenAm ? '<div class="sec-date">Abgeschlossen<br>'+esc(fmtDate(ab.abgeschlossenAm))+'</div>' : '')
      + '</div>';
    if(notEmpty(ab.zusammenfassung)){
      h += '<div class="block"><div class="block-label">Zusammenfassung</div><div class="block-body">'+esc(ab.zusammenfassung)+'</div></div>';
    }
    if(notEmpty(ab.instandstellung)){
      h += '<div class="block"><div class="block-label">Instandstellung</div><div class="block-body">'+esc(ab.instandstellung)+'</div></div>';
    }
    if(notEmpty(ab.weitereSchaeden)){
      h += '<div class="block"><div class="block-label">Weitere Schäden / Folgekosten</div><div class="block-body">'+esc(ab.weitereSchaeden)+'</div></div>';
    }
    h += photoSectionHtml('Abschluss-Fotos', ab.fotos);

    // Unterschriften-Block bewusst entfernt (User-Wunsch).

    h += '</div></section>';
    return h;
  }

  // ── Komplettes HTML zusammenbauen ──────────────────────────────────
  function buildHtml(s, opts){
    opts = opts || {};
    var titel = s.titel || typLabel(s.typ);
    var org = opts.org;
    var orgName = (org && org.name) ? org.name : 'GEMA';
    var datum   = fmtDate(Date.now());
    // CSS-content darf nur Strings + counter() — escapen wir " und \ im
    // Org-Namen / Titel, damit der String nicht aufbricht.
    function _cssStr(s){ return String(s||'').replace(/\\/g,'\\\\').replace(/"/g,'\\"'); }
    var pageCss = '@media print{@page{size:A4;margin:14mm 0 14mm 0;'
      + '@top-left{content:"'+_cssStr(orgName)+'";font-family:\'DM Sans\',sans-serif;font-size:7.5pt;font-weight:600;letter-spacing:.04em;color:#525d66;padding:5mm 15mm 0;}'
      + '@top-right{content:"Schadensbericht · '+_cssStr(titel)+'";font-family:\'DM Sans\',sans-serif;font-size:7.5pt;letter-spacing:.04em;color:#8a949c;padding:5mm 15mm 0;}'
      + '@bottom-left{content:"'+_cssStr(orgName)+' · Erstellt '+_cssStr(datum)+'";font-family:\'DM Sans\',sans-serif;font-size:7.5pt;letter-spacing:.04em;color:#8a949c;padding:0 15mm 4mm;}'
      + '@bottom-right{content:"Seite " counter(page) " von " counter(pages);font-family:\'DM Sans\',sans-serif;font-size:7.5pt;font-weight:600;letter-spacing:.04em;color:#525d66;padding:0 15mm 4mm;}'
      + '}'
      // page-body braucht im Print weniger top/bottom-padding — @page
      // bringt den Rand fuer Header/Footer mit.
      + '.page-body{padding:6mm 15mm 6mm!important;}'
      + '.cover{min-height:auto!important;padding-top:0!important;}'
      + '.cover-hero{margin-top:22mm!important;}'
      + '.cover-foot{padding-bottom:0!important;margin-top:6mm!important;}'
      + '.doc-header,.doc-footer{display:none!important;}'
      + '}';

    return '<!doctype html><html lang="de"><head><meta charset="utf-8">'
      + '<title>Schadensbericht — '+esc(titel)+'</title>'
      + '<style>'+REPORT_CSS+pageCss+'</style>'
      + '</head><body>'
      + '<div class="print-toolbar no-print">'
        + '<button onclick="window.print()">Drucken / Als PDF speichern</button>'
        + '<button class="secondary" onclick="window.close()">Schliessen</button>'
      + '</div>'
      + '<div class="content">'
        + coverHtml(s, opts)
        + analyseHtml(s)
        + trocknungHtml(s)
        + abschlussHtml(s, opts)
      + '</div>'
      + '</body></html>';
  }

  // ── Public API ──────────────────────────────────────────────────────
  function exportPrint(s, opts){
    if(!s) return;
    var html = buildHtml(s, opts || {});
    var win;
    try{
      win = window.open('', '_blank', 'width=900,height=1200');
    }catch(e){}
    if(!win){
      // Pop-up blocked — fallback: in iframe rendern
      console.warn('[GemaSchadenPDF] window.open blockiert, Fallback iframe');
      var blob = new Blob([html], {type:'text/html'});
      var url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    // Print-Dialog nach Render-Warm-Up (Fonts, Images)
    win.addEventListener('load', function(){
      setTimeout(function(){ try{ win.focus(); }catch(e){} }, 100);
    });
  }

  w.GemaSchadenPDF = {
    exportPrint: exportPrint,
    buildHtml:   buildHtml      // exponiert fuer Tests / Debug
  };
})(typeof window !== 'undefined' ? window : this);
