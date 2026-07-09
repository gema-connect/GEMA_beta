/* GEMA Revisionsunterlagen — HTML/Print-Export (window.print → PDF)
   Muster: gema_schaden_pdf.js. Branding aus org.settings.pdfFarben +
   Logo org.logoVector||org.logo (Fallback GEMA-SVG). Kopf-/Fusszeilen via
   @page-Margin-Boxes. Aufruf: GemaRevisionPDF.exportPrint(dossier, opts)
   opts = { org, user, objektName, objektAdresse, shareUrl } */
(function(w){
  'use strict';

  var GEMA_LOGO_SVG = '<svg class="brand-svg" xmlns="http://www.w3.org/2000/svg" viewBox="80 196 415 175" preserveAspectRatio="xMidYMid meet"><defs><clipPath id="rev_c1"><path d="M 29 17 L 145 17 L 145 151 L 29 151 Z" clip-rule="nonzero"/></clipPath><clipPath id="rev_c2"><path d="M 58.367188 0.613281 L 173.855469 67.289062 L 116.105469 167.3125 L 0.621094 100.636719 Z" clip-rule="nonzero"/></clipPath><clipPath id="rev_c3"><path d="M 73 47.414062 L 123.597656 47.414062 L 123.597656 98 L 73 98 Z" clip-rule="nonzero"/></clipPath><clipPath id="rev_c4"><rect x="0" width="174" y="0" height="168"/></clipPath></defs><g transform="matrix(1,0,0,1,83,199)"><g clip-path="url(#rev_c4)"><g clip-path="url(#rev_c1)"><g clip-path="url(#rev_c2)"><path fill="#1e1b4b" d="M 144.929688 50.640625 L 144.929688 117.292969 L 87.207031 150.617188 L 29.484375 117.292969 L 29.484375 50.640625 L 87.207031 17.3125 Z" fill-opacity="1" fill-rule="nonzero"/></g></g></g><path fill="#fff" d="M 98.042969 73.117188 C 96.210938 71.285156 93.945312 69.882812 91.488281 69.070312 C 85.503906 75.054688 85.019531 75.28125 84.257812 77.097656 C 90.328125 76.699219 95.191406 82.253906 93.839844 88.324219 C 93.011719 92.078125 84.535156 99.5 76.90625 107.300781 C 73.34375 110.933594 67.460938 110.898438 63.863281 107.300781 C 60.265625 103.703125 60.265625 97.855469 63.863281 94.257812 L 71.992188 86.128906 C 70.988281 82.390625 71.214844 78.445312 72.476562 74.933594 L 57.203125 90.210938 C 50.664062 96.75 50.664062 107.40625 57.203125 113.960938 C 63.757812 120.515625 74.378906 120.515625 80.953125 113.960938 L 98.042969 96.871094 C 104.550781 90.363281 104.652344 79.726562 98.042969 73.117188 Z"/><g clip-path="url(#rev_c3)"><path fill="#fff" d="M 118.835938 76.078125 C 122.003906 72.910156 123.75 68.691406 123.75 64.210938 C 123.75 54.9375 116.242188 47.414062 106.953125 47.414062 C 102.472656 47.414062 98.253906 49.160156 95.085938 52.324219 C 90.8125 56.597656 82.269531 65.144531 77.996094 69.417969 C 71.507812 75.902344 71.371094 86.542969 77.996094 93.167969 C 79.828125 95 82.09375 96.402344 84.550781 97.214844 C 90.503906 91.265625 91.019531 91.023438 91.78125 89.1875 C 89.152344 89.363281 86.574219 88.410156 84.671875 86.507812 C 81.039062 82.875 81.109375 77.027344 84.671875 73.464844 C 87.855469 70.28125 95.882812 62.253906 99.132812 59.003906 C 102.734375 55.402344 108.578125 55.386719 112.179688 59.003906 C 115.777344 62.601562 115.777344 68.449219 112.179688 72.046875 L 104.046875 80.175781 C 105.066406 84.015625 104.824219 87.890625 103.5625 91.367188 Z"/></g></g></g><g fill="#1e1b4b"><g transform="translate(243.214799,313.539633)"><path d="M 62.46875 -35.8125 L 62.46875 -21.9375 C 60.8125 -14.34375 57.191406 -8.59375 51.609375 -4.6875 C 46.035156 -0.789062 39.8125 1.15625 32.9375 1.15625 C 24.3125 1.15625 16.960938 -2.070312 10.890625 -8.53125 C 4.816406 -14.988281 1.78125 -22.789062 1.78125 -31.9375 C 1.78125 -41.226562 4.75 -49.078125 10.6875 -55.484375 C 16.632812 -61.890625 24.050781 -65.09375 32.9375 -65.09375 C 43.320312 -65.09375 51.535156 -61.453125 57.578125 -54.171875 L 48.046875 -43.703125 C 44.640625 -49.179688 39.890625 -51.921875 33.796875 -51.921875 C 29.296875 -51.921875 25.457031 -49.96875 22.28125 -46.0625 C 19.101562 -42.164062 17.515625 -37.457031 17.515625 -31.9375 C 17.515625 -26.507812 19.101562 -21.867188 22.28125 -18.015625 C 25.457031 -14.171875 29.296875 -12.25 33.796875 -12.25 C 37.515625 -12.25 40.753906 -13.367188 43.515625 -15.609375 C 46.273438 -17.859375 47.65625 -20.84375 47.65625 -24.5625 L 32.9375 -24.5625 L 32.9375 -35.8125 Z"/></g><g transform="translate(307.462326,313.539633)"><path d="M 41.234375 -63.9375 L 41.234375 -51.15625 L 19.21875 -51.15625 L 19.21875 -38.4375 L 40.296875 -38.4375 L 40.296875 -25.65625 L 19.21875 -25.65625 L 19.21875 -12.78125 L 41.234375 -12.78125 L 41.234375 0 L 4.65625 0 L 4.65625 -63.9375 Z"/></g><g transform="translate(352.412344,313.539633)"><path d="M 57.5 0 L 54.484375 -37.890625 L 54.09375 -37.890625 L 41 -0.390625 L 32.3125 -0.390625 L 19.21875 -37.890625 L 18.828125 -37.890625 L 15.8125 0 L 1.234375 0 L 6.96875 -63.9375 L 22.46875 -63.9375 L 36.65625 -27.046875 L 50.84375 -63.9375 L 66.34375 -63.9375 L 72.078125 0 Z"/></g><g transform="translate(425.727374,313.539633)"><path d="M 37.125 -63.9375 L 62.9375 0 L 47.28125 0 L 42.546875 -12.78125 L 18.21875 -12.78125 L 13.484375 0 L -2.171875 0 L 23.640625 -63.9375 Z M 37.59375 -25.578125 L 30.453125 -44.171875 L 30.296875 -44.171875 L 23.171875 -25.578125 Z"/></g></g></svg>';

  function esc(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function nl2br(v){ return esc(v).replace(/\n/g,'<br>'); }
  function fmtDate(ts){ try{ var d=new Date(ts); return ('0'+d.getDate()).slice(-2)+'.'+('0'+(d.getMonth()+1)).slice(-2)+'.'+d.getFullYear(); }catch(e){ return ''; } }

  // ── Firmenfarben (identisch zu gema_schaden_pdf.js, standalone) ──
  function _hexToRgb(hex){ hex=String(hex||'').trim().replace(/^#/,''); if(hex.length===3)hex=hex.charAt(0)+hex.charAt(0)+hex.charAt(1)+hex.charAt(1)+hex.charAt(2)+hex.charAt(2); if(!/^[0-9a-fA-F]{6}$/.test(hex))return null; return {r:parseInt(hex.slice(0,2),16),g:parseInt(hex.slice(2,4),16),b:parseInt(hex.slice(4,6),16)}; }
  function _rgbToHex(r,g,b){ function h(n){ n=Math.max(0,Math.min(255,Math.round(n))); return (n<16?'0':'')+n.toString(16); } return '#'+h(r)+h(g)+h(b); }
  function _relLum(rgb){ var a=[rgb.r,rgb.g,rgb.b].map(function(v){ v/=255; return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4); }); return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2]; }
  function _contrastVsWhite(rgb){ return 1.05/(_relLum(rgb)+0.05); }
  function _darkenForWhiteBg(hex,target){ var rgb=_hexToRgb(hex); if(!rgb)return null; if(_contrastVsWhite(rgb)>=target)return _rgbToHex(rgb.r,rgb.g,rgb.b); var f=1.0; for(var i=0;i<40;i++){ f-=0.025; var c={r:rgb.r*f,g:rgb.g*f,b:rgb.b*f}; if(_contrastVsWhite(c)>=target)return _rgbToHex(c.r,c.g,c.b); } return '#1f2933'; }
  function _lightTint(hex,whiteMix){ var rgb=_hexToRgb(hex); if(!rgb)return null; var m=whiteMix==null?0.92:whiteMix; return _rgbToHex(rgb.r+(255-rgb.r)*m,rgb.g+(255-rgb.g)*m,rgb.b+(255-rgb.b)*m); }
  function _brandRootCss(org){
    var pf=org&&org.settings&&org.settings.pdfFarben;
    if(!pf||!pf.primary)return '';
    var accent=_darkenForWhiteBg(pf.primary,4.5); if(!accent)return '';
    var accentDeep=_darkenForWhiteBg(pf.primary,7)||accent;
    var forest=pf.secondary?(_darkenForWhiteBg(pf.secondary,4.5)||accentDeep):accentDeep;
    var tint=_lightTint(pf.primary)||'#eef2ff';
    return ':root{--accent:'+accent+';--accent-deep:'+accentDeep+';--forest:'+forest+';--tint:'+tint+';}';
  }

  function brandHtml(org){
    var logoSrc=org&&(org.logoVector||org.logo);
    if(logoSrc&&/^data:image\//.test(logoSrc)) return '<img class="brand-logo-img" src="'+esc(logoSrc)+'" alt="Logo"/>';
    return GEMA_LOGO_SVG;
  }

  var REPORT_CSS = ''
    +':root{--accent:#3730a3;--accent-deep:#1e1b4b;--forest:#1e1b4b;--tint:#eef2ff;--ink:#0f172a;--mut:#5b6472;--brd:#dbe0ea;}'
    +'*{box-sizing:border-box}'
    +'html,body{margin:0;padding:0;background:#e7ebf2;font-family:"DM Sans",ui-sans-serif,system-ui,sans-serif;color:var(--ink);font-optical-sizing:auto;font-variation-settings:"opsz" 14;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
    +'.content{}'
    +'.sheet{width:210mm;min-height:297mm;margin:8mm auto;background:#fff;box-shadow:0 3px 18px rgba(0,0,0,.14);padding:18mm 16mm;position:relative}'
    +'@media print{body{background:#fff}.sheet{margin:0;box-shadow:none;width:auto;min-height:auto;padding:6mm 15mm;page-break-after:always}.sheet:last-child{page-break-after:auto}}'
    +'.brand{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:10mm}'
    +'.brand-logo-img{max-height:20mm;max-width:64mm;object-fit:contain;object-position:left top}'
    +'.brand-svg{height:16mm;width:auto}'
    +'.brand-r{text-align:right;font-size:8.5pt;color:var(--mut);line-height:1.5}'
    +'.cover-eyebrow{font-size:8.5pt;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}'
    +'.cover-title{font-size:26pt;font-weight:900;line-height:1.05;margin:4mm 0 2mm}'
    +'.cover-obj{font-size:14pt;font-weight:700;color:var(--ink)}'
    +'.cover-pill{display:inline-block;margin-top:4mm;font-size:8.5pt;font-weight:800;padding:2px 12px;border-radius:999px;background:var(--tint);color:var(--accent);border:1px solid var(--accent)}'
    +'.meta{margin-top:12mm;display:grid;grid-template-columns:1fr 1fr;gap:5mm 10mm}'
    +'.meta .lbl{font-size:7.5pt;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--mut)}'
    +'.meta .val{font-size:10.5pt;font-weight:600;white-space:pre-line;margin-top:1mm}'
    +'.cover-qr{position:absolute;right:16mm;bottom:18mm;text-align:center}'
    +'.cover-qr img,.cover-qr canvas{width:30mm;height:30mm}'
    +'.cover-qr .cap{font-size:7pt;color:var(--mut);margin-top:1mm;max-width:34mm}'
    +'.toc-h{font-size:13pt;font-weight:900;color:var(--accent);margin-bottom:4mm;padding-bottom:2mm;border-bottom:2px solid var(--accent)}'
    +'.toc-row{display:flex;gap:8px;font-size:10.5pt;padding:2mm 0;border-bottom:1px dotted var(--brd)}'
    +'.toc-nr{min-width:12mm;font-weight:800;color:var(--accent)}'
    +'.toc-e2{padding-left:12mm;font-size:10pt;color:var(--mut)}'
    +'.sec-band{background:var(--accent);color:#fff;border-radius:8px;padding:5mm 6mm;margin:0 0 6mm}'
    +'.sec-band .snr{font-size:9pt;font-weight:800;opacity:.85;letter-spacing:.1em}'
    +'.sec-band .sti{font-size:16pt;font-weight:900;margin-top:1mm}'
    +'.sec-desc{font-size:9.5pt;color:var(--mut);margin-bottom:5mm}'
    +'.blk{margin-bottom:6mm;break-inside:avoid}'
    +'.blk-h{font-size:11pt;font-weight:800;color:var(--accent);margin-bottom:2mm}'
    +'.blk-body{font-size:10pt;line-height:1.55;color:#000;white-space:pre-wrap}'
    +'.tbl{width:100%;border-collapse:collapse;font-size:9pt;margin:2mm 0}'
    +'.tbl th,.tbl td{border:1px solid var(--brd);padding:2mm 3mm;text-align:left;vertical-align:top}'
    +'.tbl th{background:var(--tint);font-weight:800;color:var(--accent-deep)}'
    +'.tbl thead{display:table-header-group}'
    +'.att{display:flex;align-items:center;gap:8px;border:1px solid var(--brd);border-radius:8px;padding:3mm 4mm;margin-bottom:2mm;font-size:9.5pt;break-inside:avoid}'
    +'.att .ic{font-size:13pt}'
    +'.att .nm{flex:1;font-weight:700}'
    +'.att .mt{font-size:8pt;color:var(--mut)}'
    +'.att.ph{background:#fffbeb;border-color:#fcd34d}'
    +'.att a{color:var(--accent);text-decoration:none;font-weight:700}'
    +'.att-img{max-width:100%;max-height:120mm;object-fit:contain;border:1px solid var(--brd);border-radius:6px;margin:2mm 0}'
    +'.print-toolbar{position:fixed;top:12px;right:12px;z-index:10;display:flex;gap:8px}'
    +'.print-toolbar button{font-family:inherit;font-size:12px;font-weight:700;padding:9px 14px;border-radius:9px;border:none;background:var(--accent);color:#fff;cursor:pointer;box-shadow:0 3px 10px rgba(0,0,0,.2)}'
    +'.print-toolbar button.secondary{background:#fff;color:var(--ink);border:1.5px solid var(--brd)}'
    +'@media print{.print-toolbar,.no-print{display:none!important}}';

  var _DT_ICON={datenblatt:'📄',technische_zeichnung:'📐',bedienungsanleitung:'📘',montageanleitung:'🔧',wartungsanleitung:'🛠',konformitaetserklaerung:'✅',zertifikat:'🏅',schema:'🗺',ersatzteilliste:'🧩',garantie:'🛡',sonstiges:'📎'};

  function coverHtml(d, opts){
    var db=d.deckblatt||{}; var org=opts.org||{};
    var orgName=(org.name)||'GEMA';
    var orgFoot=[org.strasse,[org.plz,org.ort].filter(Boolean).join(' ')].filter(Boolean).join('<br>');
    var stLabel={in_arbeit:'In Arbeit',bereit:'Bereit zur Übergabe',uebergeben:'Übergeben'}[d.status]||d.status;
    var h='<div class="sheet"><div class="brand"><div>'+brandHtml(org)+'</div><div class="brand-r">'+esc(orgName)+(orgFoot?'<br>'+orgFoot:'')+'</div></div>';
    h+='<div class="cover-eyebrow">Revisionsunterlagen · Übergabedossier</div>';
    h+='<div class="cover-title">'+esc(db.dokumentTitel||'Betriebs- und Wartungsanleitung')+'</div>';
    h+='<div class="cover-obj">'+esc(db.objektName||opts.objektName||'')+'</div>';
    h+='<div style="font-size:10.5pt;color:var(--mut);margin-top:1mm">'+esc([db.strasse,db.plzOrt].filter(Boolean).join(', ')||opts.objektAdresse||'')+'</div>';
    h+='<span class="cover-pill">'+esc(stLabel)+'</span>';
    var meta=[];
    if(db.bauherr)meta.push(['Bauherrschaft',db.bauherr]);
    if(db.architekt)meta.push(['Architekt / Generalplaner',db.architekt]);
    if(db.unternehmer)meta.push(['Unternehmer',db.unternehmer]);
    if(db.anlageNr)meta.push(['Anlage-Nr.',db.anlageNr]);
    if(db.version)meta.push(['Version',db.version]);
    if(db.bearbeiter)meta.push(['Bearbeiter',db.bearbeiter]);
    if(db.datum)meta.push(['Datum',fmtDate(db.datum)||db.datum]);
    h+='<div class="meta">'+meta.map(function(m){return '<div><div class="lbl">'+esc(m[0])+'</div><div class="val">'+esc(m[1])+'</div></div>';}).join('')+'</div>';
    if(opts.shareUrl){ h+='<div class="cover-qr"><div id="revqr"></div><div class="cap">Digitaler Zugriff für die Bauherrschaft</div></div>'; }
    h+='</div>';
    return h;
  }

  function tocHtml(d){
    var h='<div class="sheet"><div class="toc-h">Inhaltsverzeichnis</div>';
    (d.kapitel||[]).forEach(function(k){
      var cnt=(k.eintraege||[]).filter(function(e){return !e.ausgeblendet;}).length;
      h+='<div class="toc-row'+(k.ebene===2?' toc-e2':'')+'"><span class="toc-nr">'+esc(k.nr)+'</span><span style="flex:1">'+esc(k.titel)+'</span>'+(cnt?'<span style="color:var(--mut);font-size:9pt">'+cnt+'</span>':'')+'</div>';
    });
    h+='</div>';
    return h;
  }

  function entryHtml(e){
    if(e.ausgeblendet) return '';
    if(e.typ==='text'){ return '<div class="blk"><div class="blk-h">'+esc(e.titel||'')+'</div><div class="blk-body">'+nl2br(e.text||'')+'</div></div>'; }
    if(e.typ==='tabelle'){
      var h='<div class="blk"><div class="blk-h">'+esc(e.titel||'')+'</div><table class="tbl"><thead><tr>'+(e.spalten||[]).map(function(c){return '<th>'+esc(c)+'</th>';}).join('')+'</tr></thead><tbody>';
      var zeilen=e.zeilen||[];
      if(e.tabellenArt==='kontrollblatt'&&!zeilen.length){ for(var i=0;i<12;i++)h+='<tr>'+(e.spalten||[]).map(function(){return '<td style="height:7mm">&nbsp;</td>';}).join('')+'</tr>'; }
      else { zeilen.forEach(function(z){ h+='<tr>'+(e.spalten||[]).map(function(c,ci){return '<td>'+esc(z[ci]||'')+'</td>';}).join('')+'</tr>'; }); }
      h+='</tbody></table></div>';
      return h;
    }
    if(e.typ==='verweis'){ return '<div class="att"><span class="ic">🔗</span><span class="nm">'+esc(e.titel||'')+'</span>'+(e.linkUrl?'<a href="'+esc(e.linkUrl)+'">'+esc(e.linkLabel||'öffnen')+' →</a>':'')+'</div>'; }
    if(e.typ==='platzhalter'){ return '<div class="att ph"><span class="ic">⚠</span><span class="nm">'+esc(e.titel||'')+'</span><span class="mt">'+(e.status==='angefordert'?'angefordert':'fehlt')+'</span></div>'; }
    if(e.typ==='dokument'||e.typ==='produktdok'){
      var src=e.url||e.dataUrl; var ic=_DT_ICON[e.dokTyp]||'📎';
      var isImg=src&&(/^data:image\//.test(src)||/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(src||''))&&e.format!=='pdf';
      var h='<div class="att"><span class="ic">'+ic+'</span><span class="nm">'+esc(e.titel||e.name||'')+'</span>'+(e.lieferantFirma?'<span class="mt">'+esc(e.lieferantFirma)+'</span>':'')+(src?'<a href="'+esc(src)+'" target="_blank">öffnen →</a>':'<span class="mt">nur in GEMA</span>')+'</div>';
      if(isImg)h+='<img class="att-img" src="'+esc(src)+'"/>';
      return h;
    }
    return '';
  }

  function sectionsHtml(d){
    var out='';
    // Kapitel gruppieren: jedes Ebene-1-Kapitel startet ein neues Blatt
    var groups=[]; var cur=null;
    (d.kapitel||[]).forEach(function(k){ if(k.ebene===2&&cur){ cur.push(k); } else { cur=[k]; groups.push(cur); } });
    groups.forEach(function(grp){
      var head=grp[0];
      out+='<div class="sheet"><div class="sec-band"><div class="snr">Kapitel '+esc(head.nr)+'</div><div class="sti">'+esc(head.titel)+'</div></div>';
      grp.forEach(function(k,gi){
        if(gi>0)out+='<div class="blk-h" style="font-size:12pt;margin-top:5mm">'+esc(k.nr)+' '+esc(k.titel)+'</div>';
        if(k.beschreibung)out+='<div class="sec-desc">'+esc(k.beschreibung)+'</div>';
        if(k.einleitungText)out+='<div class="blk-body" style="margin-bottom:5mm">'+nl2br(k.einleitungText)+'</div>';
        (k.eintraege||[]).forEach(function(e){ out+=entryHtml(e); });
      });
      out+='</div>';
    });
    return out;
  }

  function buildHtml(d, opts){
    opts=opts||{}; var org=opts.org||{};
    var orgName=(org.name)||'GEMA';
    var titel=(d.deckblatt&&d.deckblatt.dokumentTitel)||d.titel||'Revisionsunterlagen';
    var datum=fmtDate(Date.now());
    function _cssStr(s){ return String(s||'').replace(/\\/g,'\\\\').replace(/"/g,'\\"'); }
    var pageCss='@media print{@page{size:A4 portrait;margin:14mm 0 14mm 0;'
      +'@top-left{content:"'+_cssStr(orgName)+'";font-family:\'DM Sans\',sans-serif;font-size:7.5pt;font-weight:600;letter-spacing:.04em;color:#525d66;padding:5mm 15mm 0;}'
      +'@top-right{content:"Revisionsunterlagen · '+_cssStr(opts.objektName||d.objektName||'')+'";font-family:\'DM Sans\',sans-serif;font-size:7.5pt;letter-spacing:.04em;color:#8a949c;padding:5mm 15mm 0;}'
      +'@bottom-left{content:"'+_cssStr(orgName)+' · '+_cssStr(datum)+'";font-family:\'DM Sans\',sans-serif;font-size:7.5pt;letter-spacing:.04em;color:#8a949c;padding:0 15mm 4mm;}'
      +'@bottom-right{content:"Seite " counter(page) " von " counter(pages);font-family:\'DM Sans\',sans-serif;font-size:7.5pt;font-weight:600;letter-spacing:.04em;color:#525d66;padding:0 15mm 4mm;}'
      +'}}';
    var qrScript='';
    if(opts.shareUrl){
      qrScript='<scr'+'ipt src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js" onload="try{new QRCode(document.getElementById(\'revqr\'),{text:'+JSON.stringify(opts.shareUrl)+',width:120,height:120,correctLevel:QRCode.CorrectLevel.M});}catch(e){}"></scr'+'ipt>';
    }
    return '<!doctype html><html lang="de"><head><meta charset="utf-8">'
      +'<meta name="viewport" content="width=device-width, initial-scale=1">'
      +'<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700;9..40,800;9..40,900&display=swap" rel="stylesheet">'
      +'<title>Revisionsunterlagen — '+esc(titel)+'</title>'
      +'<style>'+REPORT_CSS+_brandRootCss(org)+pageCss+'</style></head><body>'
      +'<div class="print-toolbar no-print"><button onclick="window.print()">Drucken / Als PDF speichern</button><button class="secondary" onclick="window.close()">Schliessen</button></div>'
      +'<div class="content">'+coverHtml(d,opts)+tocHtml(d)+sectionsHtml(d)+'</div>'
      +qrScript
      +'</body></html>';
  }

  function exportPrint(d, opts){
    if(!d)return;
    var html=buildHtml(d,opts||{});
    var win; try{ win=window.open('','_blank','width=900,height=1200'); }catch(e){}
    if(!win){ var blob=new Blob([html],{type:'text/html'}); window.open(URL.createObjectURL(blob),'_blank'); return; }
    win.document.open(); win.document.write(html); win.document.close();
    win.addEventListener('load',function(){ setTimeout(function(){ try{win.focus();}catch(e){} },100); });
  }

  // ══════════════════════════════════════════════════════════════════
  //  KOMPLETT-PDF — Struktur (jsPDF) + zusammengeführte Anhänge (pdf-lib)
  // ══════════════════════════════════════════════════════════════════
  var CDN_JSPDF='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  var CDN_AUTOTABLE='https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
  var CDN_PDFLIB='https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
  var _loaded={};
  function _loadScript(src){ return new Promise(function(res,rej){ if(_loaded[src])return res(); var s=document.createElement('script'); s.src=src; s.onload=function(){_loaded[src]=1;res();}; s.onerror=function(){rej(new Error('Bibliothek nicht ladbar: '+src));}; document.head.appendChild(s); }); }
  async function _ensureLibs(){
    if(!(w.jspdf&&w.jspdf.jsPDF)) await _loadScript(CDN_JSPDF);
    // autotable haengt sich an den jsPDF-Prototyp — nach jsPDF laden
    try{ var probe=new w.jspdf.jsPDF(); if(typeof probe.autoTable!=='function') await _loadScript(CDN_AUTOTABLE); }catch(e){ await _loadScript(CDN_AUTOTABLE); }
    if(!w.PDFLib) await _loadScript(CDN_PDFLIB);
    if(!(w.jspdf&&w.jspdf.jsPDF)||!w.PDFLib) throw new Error('PDF-Bibliotheken nicht verfügbar (offline?)');
  }
  function _accentRgb(org){ var pf=org&&org.settings&&org.settings.pdfFarben; var hex=(pf&&pf.primary&&_darkenForWhiteBg(pf.primary,4.5))||'#3730a3'; return _hexToRgb(hex)||{r:55,g:48,b:163}; }
  function _dataUrlToBytes(d){ var b64=(d.split(',')[1]||''); var bin=atob(b64); var a=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i); return a; }
  async function _fetchBytes(src){
    if(/^data:/.test(src)) return _dataUrlToBytes(src);
    var cand=[src];
    try{ var m=src.match(/^https?:\/\/[^/]+(\/storage\/v1\/.*)$/); if(m) cand.push(location.origin+'/sb'+m[1]); }catch(e){}
    var lastErr;
    for(var i=0;i<cand.length;i++){ try{ var r=await fetch(cand[i]); if(r.ok) return new Uint8Array(await r.arrayBuffer()); lastErr=new Error('HTTP '+r.status); }catch(e){ lastErr=e; } }
    throw lastErr||new Error('fetch failed');
  }
  function _isImg(a){ var s=(a.url||a.dataUrl||''); return a.format!=='pdf' && (/^data:image\//.test(s)||/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(s)||['jpg','jpeg','png','webp','gif'].indexOf(a.format)>=0); }
  function _imgKind(a){ var s=(a.url||a.dataUrl||''); if(/png/i.test(a.format)||/^data:image\/png/i.test(s)||/\.png(\?|$)/i.test(s)) return 'png'; if(/jpe?g/i.test(a.format)||/^data:image\/jpe?g/i.test(s)||/\.jpe?g(\?|$)/i.test(s)) return 'jpg'; return ''; }

  // Anhaenge (dokument/produktdok mit Quelle) in Kapitel-Reihenfolge
  function _collectAttachments(d){
    var out=[];
    (d.kapitel||[]).forEach(function(k){
      (k.eintraege||[]).forEach(function(e){
        if(e.ausgeblendet) return;
        if((e.typ==='dokument'||e.typ==='produktdok') && (e.url||e.dataUrl)){
          out.push({ kapNr:k.nr, kapTitel:k.titel, titel:e.titel||e.name||'Dokument', url:e.url||'', dataUrl:e.dataUrl||'', format:e.format||'', dokTyp:e.dokTyp||'', lieferantFirma:e.lieferantFirma||'' });
        }
      });
    });
    return out;
  }

  // jsPDF-Struktur (Cover, Inhalt, Kapitel mit Text/Tabellen + Beilagen-Liste)
  function _buildStructurePdf(d, opts, attachments){
    var org=(opts&&opts.org)||{}; var db=d.deckblatt||{};
    var jsPDF=w.jspdf.jsPDF; var doc=new jsPDF({unit:'mm',format:'a4',orientation:'portrait'});
    var PW=210, PH=297, M=16; var acc=_accentRgb(org); var ink=[15,23,42], mut=[91,100,114];
    function setC(c){ doc.setTextColor(c[0],c[1],c[2]); }
    var y=M;
    function ensure(sp){ if(y+sp>PH-16){ doc.addPage(); y=M; } }
    // ── Cover ──
    var logo=(org.logo && /^data:image\//.test(org.logo))?org.logo:'';
    if(logo){ try{ var fmt=/png/i.test(logo)?'PNG':'JPEG'; doc.addImage(logo,fmt,M,y,0,16); }catch(e){} }
    doc.setFont('helvetica','bold'); doc.setFontSize(9); setC(acc);
    doc.text((org.name||'GEMA').toUpperCase(), PW-M, y+6, {align:'right'});
    y=48;
    doc.setFontSize(9); setC(acc); doc.setFont('helvetica','bold'); doc.text('REVISIONSUNTERLAGEN · ÜBERGABEDOSSIER', M, y); y+=9;
    doc.setFontSize(24); setC(ink); doc.text(doc.splitTextToSize(db.dokumentTitel||'Betriebs- und Wartungsanleitung', PW-2*M), M, y); y+=13;
    doc.setFontSize(14); doc.text(db.objektName||opts.objektName||'', M, y); y+=7;
    doc.setFontSize(10.5); setC(mut); doc.setFont('helvetica','normal');
    var adr=[db.strasse,db.plzOrt].filter(Boolean).join(', ')||opts.objektAdresse||''; if(adr){ doc.text(adr, M, y); y+=6; }
    y+=8;
    var meta=[];
    if(db.bauherr)meta.push(['Bauherrschaft',db.bauherr]);
    if(db.architekt)meta.push(['Architekt / Generalplaner',db.architekt]);
    if(db.unternehmer)meta.push(['Unternehmer',db.unternehmer]);
    if(db.anlageNr)meta.push(['Anlage-Nr.',db.anlageNr]);
    if(db.version)meta.push(['Version',db.version]);
    if(db.datum)meta.push(['Datum',fmtDate(db.datum)||db.datum]);
    meta.forEach(function(mrow){ ensure(12); doc.setFont('helvetica','bold'); doc.setFontSize(7.5); setC(mut); doc.text(mrow[0].toUpperCase(), M, y); y+=4; doc.setFont('helvetica','normal'); doc.setFontSize(10.5); setC(ink); var lines=doc.splitTextToSize(String(mrow[1]), PW-2*M); doc.text(lines, M, y); y+=lines.length*5+2; });
    // ── Inhaltsverzeichnis ──
    doc.addPage(); y=M;
    doc.setFont('helvetica','bold'); doc.setFontSize(14); setC(acc); doc.text('Inhaltsverzeichnis', M, y); y+=3; doc.setDrawColor(acc[0],acc[1],acc[2]); doc.setLineWidth(0.6); doc.line(M,y,PW-M,y); y+=7;
    (d.kapitel||[]).forEach(function(k){ ensure(7); doc.setFont('helvetica', k.ebene===2?'normal':'bold'); doc.setFontSize(k.ebene===2?10:11); setC(k.ebene===2?mut:ink); doc.text((k.ebene===2?'    ':'')+k.nr+'  '+k.titel, M, y); y+=6; });
    // ── Kapitel ──
    (d.kapitel||[]).forEach(function(k){
      var atts=attachments.filter(function(a){return a.kapNr===k.nr;});
      var ents=(k.eintraege||[]).filter(function(e){return !e.ausgeblendet;});
      if(k.ebene===1){ doc.addPage(); y=M; doc.setFillColor(acc[0],acc[1],acc[2]); doc.rect(M,y,PW-2*M,16,'F'); doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.text('KAPITEL '+k.nr, M+4, y+6); doc.setFontSize(15); doc.text(doc.splitTextToSize(k.titel,PW-2*M-8), M+4, y+12.5); y+=22; }
      else { ensure(14); doc.setFont('helvetica','bold'); doc.setFontSize(12); setC(acc); doc.text(k.nr+'  '+k.titel, M, y); y+=7; }
      if(k.beschreibung){ ensure(8); doc.setFont('helvetica','italic'); doc.setFontSize(9.5); setC(mut); var bl=doc.splitTextToSize(k.beschreibung,PW-2*M); doc.text(bl,M,y); y+=bl.length*4.6+2; }
      if(k.einleitungText){ ensure(10); doc.setFont('helvetica','normal'); doc.setFontSize(10); setC(ink); var el=doc.splitTextToSize(k.einleitungText,PW-2*M); for(var ei=0;ei<el.length;ei++){ ensure(5); doc.text(el[ei],M,y); y+=5; } y+=2; }
      ents.forEach(function(e){
        if(e.typ==='text'){ ensure(10); doc.setFont('helvetica','bold'); doc.setFontSize(11); setC(acc); doc.text(e.titel||'',M,y); y+=5.5; doc.setFont('helvetica','normal'); doc.setFontSize(10); setC(ink); var tl=doc.splitTextToSize(e.text||'',PW-2*M); for(var ti=0;ti<tl.length;ti++){ ensure(5); doc.text(tl[ti],M,y); y+=5; } y+=3; }
        else if(e.typ==='tabelle'){ ensure(14); doc.setFont('helvetica','bold'); doc.setFontSize(11); setC(acc); doc.text(e.titel||'',M,y); y+=2;
          var body=(e.zeilen||[]).map(function(z){return (e.spalten||[]).map(function(c,ci){return String(z[ci]||'');});});
          if(!body.length && e.tabellenArt==='kontrollblatt'){ for(var ki=0;ki<10;ki++) body.push((e.spalten||[]).map(function(){return '';})); }
          try{ doc.autoTable({ head:[(e.spalten||[])], body:body, startY:y+2, margin:{left:M,right:M}, styles:{fontSize:8,cellPadding:1.6,overflow:'linebreak'}, headStyles:{fillColor:acc,textColor:255,fontStyle:'bold'}, theme:'grid' }); y=(doc.lastAutoTable&&doc.lastAutoTable.finalY||y)+5; }catch(err){ y+=4; }
        }
        else if(e.typ==='verweis'){ ensure(7); doc.setFont('helvetica','normal'); doc.setFontSize(9.5); setC(ink); doc.text('🔗 '.replace('🔗','»')+(e.titel||'')+(e.linkUrl?('  ('+e.linkUrl+')'):''),M,y); y+=6; }
        else if(e.typ==='platzhalter'){ ensure(7); doc.setFont('helvetica','italic'); doc.setFontSize(9.5); setC([180,83,9]); doc.text('⚠ '.replace('⚠','!')+(e.titel||'')+' — '+(e.status==='angefordert'?'angefordert':'fehlt'),M,y); y+=6; }
      });
      if(atts.length){ ensure(9); doc.setFont('helvetica','bold'); doc.setFontSize(9.5); setC(acc); doc.text('Angehängte Dokumente (folgende Seiten):',M,y); y+=5.5; doc.setFont('helvetica','normal'); doc.setFontSize(9.5); setC(ink);
        atts.forEach(function(a){ ensure(5.5); var t='•  '+a.titel+(a.lieferantFirma?('  ['+a.lieferantFirma+']'):''); doc.text(doc.splitTextToSize(t,PW-2*M),M,y); y+=5; }); y+=2; }
    });
    return doc.output('arraybuffer');
  }

  function _slug(s){ return String(s||'Revisionsunterlagen').replace(/[^a-zA-Z0-9\-_]+/g,'_').replace(/^_+|_+$/g,'').slice(0,60)||'Revisionsunterlagen'; }

  // Public: erzeugt EIN PDF inkl. aller angehaengten Lieferanten-PDFs/Bilder.
  // opts.onProgress(phase, done, total) optional. Liefert {ok,total,merged,failed}.
  async function exportKomplett(d, opts){
    opts=opts||{}; var prog=opts.onProgress||function(){};
    prog('libs',0,1);
    await _ensureLibs();
    var PDFLib=w.PDFLib;
    var attachments=_collectAttachments(d);
    prog('struktur',0,attachments.length);
    var structBytes=_buildStructurePdf(d,opts,attachments);
    var merged=await PDFLib.PDFDocument.load(structBytes);
    var failed=[]; var okCount=0;
    for(var i=0;i<attachments.length;i++){
      var a=attachments[i]; prog('merge',i,attachments.length);
      try{
        var bytes=await _fetchBytes(a.url||a.dataUrl);
        if(_isImg(a)){
          var kind=_imgKind(a); var img=null;
          try{ img = kind==='png' ? await merged.embedPng(bytes) : (kind==='jpg' ? await merged.embedJpg(bytes) : null); }
          catch(e2){ img=null; }
          if(!img){ // Format-Sniff-Fallback
            try{ img=await merged.embedJpg(bytes); }catch(e3){ try{ img=await merged.embedPng(bytes); }catch(e4){ img=null; } }
          }
          if(!img){ failed.push(a); continue; }
          var pg=merged.addPage([595.28,841.89]); var mgn=36; var maxW=pg.getWidth()-2*mgn, maxH=pg.getHeight()-2*mgn;
          var sc=Math.min(maxW/img.width, maxH/img.height, 1); var iw=img.width*sc, ih=img.height*sc;
          pg.drawImage(img,{x:(pg.getWidth()-iw)/2,y:(pg.getHeight()-ih)/2,width:iw,height:ih});
          okCount++;
        } else {
          var src=await PDFLib.PDFDocument.load(bytes,{ignoreEncryption:true});
          var idxs=src.getPageIndices();
          var pages=await merged.copyPages(src, idxs);
          pages.forEach(function(p){ merged.addPage(p); });
          okCount++;
        }
      }catch(err){ failed.push(a); }
    }
    // Fehlende Beilagen: Hinweisseite
    if(failed.length){
      prog('notes',attachments.length,attachments.length);
      var font=await merged.embedFont(PDFLib.StandardFonts.Helvetica);
      var bold=await merged.embedFont(PDFLib.StandardFonts.HelveticaBold);
      var np=merged.addPage([595.28,841.89]); var yy=np.getHeight()-70; var acc=_accentRgb((opts.org)||{});
      np.drawText('Nicht eingebettete Beilagen', {x:50,y:yy,size:16,font:bold,color:PDFLib.rgb(acc.r/255,acc.g/255,acc.b/255)}); yy-=12;
      np.drawText('Diese Dokumente konnten nicht automatisch zusammengeführt werden', {x:50,y:yy,size:9,font:font,color:PDFLib.rgb(.4,.4,.45)}); yy-=8;
      np.drawText('(separat verfügbar, ggf. verschlüsselt oder nicht ladbar):', {x:50,y:yy,size:9,font:font,color:PDFLib.rgb(.4,.4,.45)}); yy-=24;
      failed.forEach(function(a){ if(yy<60){ np=merged.addPage([595.28,841.89]); yy=np.getHeight()-60; } var line='•  '+(a.titel||'')+(a.lieferantFirma?('  ['+a.lieferantFirma+']'):''); np.drawText(line.slice(0,90), {x:50,y:yy,size:10,font:font,color:PDFLib.rgb(.1,.1,.15)}); yy-=16; });
    }
    // Seitennummern
    prog('nummern',attachments.length,attachments.length);
    var pfont=await merged.embedFont(PDFLib.StandardFonts.Helvetica);
    var pages2=merged.getPages(); var tot=pages2.length;
    pages2.forEach(function(p,i){ var txt='Seite '+(i+1)+' von '+tot; p.drawText(txt,{x:p.getWidth()-110,y:14,size:8,font:pfont,color:PDFLib.rgb(.42,.46,.5)}); });
    var out=await merged.save();
    var blob=new Blob([out],{type:'application/pdf'});
    var url=URL.createObjectURL(blob);
    var an=document.createElement('a'); an.href=url; an.download='Revisionsunterlagen_'+_slug((opts.objektName)||d.objektName||d.titel)+'.pdf'; document.body.appendChild(an); an.click(); setTimeout(function(){ document.body.removeChild(an); URL.revokeObjectURL(url); },1500);
    prog('fertig',attachments.length,attachments.length);
    return { ok:true, total:attachments.length, merged:okCount, failed:failed.map(function(a){return a.titel;}), bytes:out.length };
  }

  w.GemaRevisionPDF={ exportPrint:exportPrint, buildHtml:buildHtml, exportKomplett:exportKomplett };
})(window);
