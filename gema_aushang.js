/* GEMA Aushang — druckbare Mieter-/Eigentümer-Mitteilung (A4-Poster)
   Für Arbeiten, die das ganze Gebäude betreffen (v.a. Mehrfamilienhäuser):
   Wasserabstellung, Stromabschaltung, Heizungsunterbruch, Boiler-/Filterservice.
   Standardisierte Vorlagen (org-weit anpassbar via «Als Vorlage speichern» →
   org.settings.aushang.vorlagen), Pflicht-Zeitangabe von–bis, Zusatzinfos,
   Kontakt — «🖨 Drucken» öffnet das A4-Blatt zum Ausdrucken/Aushängen.

   API:
     GemaAushang.open({vorlageId?, gespeichert?, datum?, datumBis?, von?, bis?,
                       objektName?, onSave?(data)})
       — öffnet den Dialog (Vorlage wählen, Text/Zeit anpassen, drucken).
         gespeichert = früher gedruckte Daten (gewinnen über die Vorlage).
         onSave wird bei JEDEM Druck mit den finalen Daten aufgerufen —
         der Aufrufer persistiert sie am tragenden Record (Auftrag/Einsatz).
     GemaAushang.print(data) — Druckfenster direkt (data wie unten)
     GemaAushang.vorlagen() — wirksame Vorlagenliste (Defaults + Org-Overrides)

   data = {vorlageId, titel, text, zusatz, objekt, datum, datumBis, von, bis,
           kontakt, gedrucktAm}
   Konsumenten: pm_erp (Auftrag), pm_einsatzplan (Termin), sv_service (Anlage).
*/
(function(){
  'use strict';
  if (window.GemaAushang) return;

  // ── Standard-Vorlagen (Titel + inhaltlicher Text, beides anpassbar) ──
  var DEFAULTS = [
    { id:'wasser', ic:'💧', name:'Wasserabstellung', titel:'Wasserabstellung',
      text:'Sehr geehrte Mieterinnen und Mieter\n\nWegen Arbeiten an den Sanitärleitungen muss die Wasserversorgung im Gebäude im untenstehenden Zeitraum unterbrochen werden.\n\nBitte schliessen Sie vorgängig alle Wasserhahnen und benutzen Sie während des Unterbruchs keine angeschlossenen Geräte (Waschmaschine, Geschirrspüler, Boiler).\n\nWir bemühen uns, den Unterbruch so kurz wie möglich zu halten, und danken für Ihr Verständnis.' },
    { id:'strom', ic:'⚡', name:'Stromabschaltung', titel:'Stromabschaltung',
      text:'Sehr geehrte Mieterinnen und Mieter\n\nWegen Arbeiten an der Elektroinstallation muss die Stromversorgung im Gebäude im untenstehenden Zeitraum unterbrochen werden.\n\nBitte schalten Sie empfindliche Geräte (Computer, Unterhaltungselektronik) vorgängig aus und beachten Sie, dass Aufzüge, Türöffner und Beleuchtung während des Unterbruchs ausser Betrieb sind.\n\nWir bemühen uns, den Unterbruch so kurz wie möglich zu halten, und danken für Ihr Verständnis.' },
    { id:'heizung', ic:'🔥', name:'Unterbruch Heizung / Warmwasser', titel:'Unterbruch Heizung und Warmwasser',
      text:'Sehr geehrte Mieterinnen und Mieter\n\nWegen Arbeiten an der Heizungsanlage stehen Heizung und Warmwasser im untenstehenden Zeitraum nicht zur Verfügung.\n\nWir bemühen uns, den Unterbruch so kurz wie möglich zu halten, und danken für Ihr Verständnis.' },
    { id:'boiler', ic:'🚿', name:'Boilerservice', titel:'Boilerservice — kein Warmwasser',
      text:'Sehr geehrte Mieterinnen und Mieter\n\nIm untenstehenden Zeitraum führen wir die periodische Wartung des Boilers (Warmwasserspeicher) durch. Während der Arbeiten steht kein Warmwasser zur Verfügung.\n\nWir bemühen uns, die Arbeiten so rasch wie möglich abzuschliessen, und danken für Ihr Verständnis.' },
    { id:'filter', ic:'🚰', name:'Filterservice Wasserversorgung', titel:'Filterservice Wasserversorgung',
      text:'Sehr geehrte Mieterinnen und Mieter\n\nIm untenstehenden Zeitraum führen wir den periodischen Service am Wasserfilter der Hausinstallation durch. Es kann kurzzeitig zu Druckschwankungen oder kurzen Unterbrüchen der Wasserversorgung kommen.\n\nWir danken für Ihr Verständnis.' },
    { id:'allgemein', ic:'📌', name:'Allgemeine Mitteilung', titel:'Mitteilung',
      text:'Sehr geehrte Mieterinnen und Mieter\n\nIm untenstehenden Zeitraum führen wir Arbeiten im Gebäude durch. Es kann zu Lärm und kurzen Einschränkungen kommen.\n\nWir danken für Ihr Verständnis.' }
  ];

  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function _org(){try{return (window.GemaAuth&&GemaAuth.getCurrentOrg)?GemaAuth.getCurrentOrg():null;}catch(e){return null;}}
  function _today(){return new Date().toISOString().slice(0,10);}

  // Wirksame Vorlagen: Defaults, überlagert von org.settings.aushang.vorlagen
  // (gleiche id = Org-Version gewinnt; neue ids werden angehängt)
  function vorlagen(){
    var out=DEFAULTS.map(function(v){return {id:v.id,ic:v.ic,name:v.name,titel:v.titel,text:v.text};});
    var org=_org();
    var own=(org&&org.settings&&org.settings.aushang&&org.settings.aushang.vorlagen)||[];
    if(Array.isArray(own))own.forEach(function(v){
      if(!v||!v.id||!v.name)return;
      var i=-1;out.forEach(function(x,ix){if(x.id===v.id)i=ix;});
      var rec={id:String(v.id),ic:v.ic||'📌',name:String(v.name),titel:String(v.titel||v.name),text:String(v.text||'')};
      if(i>=0)out[i]=rec;else out.push(rec);
    });
    return out;
  }
  function _vorlageById(id){var l=vorlagen();for(var i=0;i<l.length;i++){if(l[i].id===id)return l[i];}return null;}

  // ── Branding: Akzent aus org.settings.pdfFarben (Kontrastschutz gegen
  //    Weiss — Helfer dupliziert, Muster gema_schaden_pdf, standalone) ──
  function _hexToRgb(hex){hex=String(hex||'').trim().replace(/^#/,'');if(hex.length===3)hex=hex.charAt(0)+hex.charAt(0)+hex.charAt(1)+hex.charAt(1)+hex.charAt(2)+hex.charAt(2);if(!/^[0-9a-fA-F]{6}$/.test(hex))return null;return{r:parseInt(hex.slice(0,2),16),g:parseInt(hex.slice(2,4),16),b:parseInt(hex.slice(4,6),16)};}
  function _rgbToHex(r,g,b){function h(n){n=Math.max(0,Math.min(255,Math.round(n)));return(n<16?'0':'')+n.toString(16);}return'#'+h(r)+h(g)+h(b);}
  function _relLum(c){var a=[c.r,c.g,c.b].map(function(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2];}
  function _contrastW(c){return 1.05/(_relLum(c)+0.05);}
  function _darken(hex,target){
    var c=_hexToRgb(hex);if(!c)return null;
    if(_contrastW(c)>=target)return _rgbToHex(c.r,c.g,c.b);
    var f=1.0;
    for(var i=0;i<40;i++){f-=0.025;var x={r:c.r*f,g:c.g*f,b:c.b*f};if(_contrastW(x)>=target)return _rgbToHex(x.r,x.g,x.b);}
    return '#1f2933';
  }
  function _tint(hex,mix){var c=_hexToRgb(hex);if(!c)return null;var m=mix==null?0.93:mix;return _rgbToHex(c.r+(255-c.r)*m,c.g+(255-c.g)*m,c.b+(255-c.b)*m);}
  function _brand(){
    var org=_org();
    var pf=org&&org.settings&&org.settings.pdfFarben;
    var acc='#0f172a',tint='#eef2f7';
    if(pf&&pf.primary&&_hexToRgb(pf.primary)){acc=_darken(pf.primary,4.5)||acc;tint=_tint(pf.primary)||tint;}
    return {acc:acc,tint:tint};
  }

  // ── Datum/Zeit-Formatierung (Deutsch, mit Wochentag) ──
  var WD=['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
  var MON=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  function _dLong(iso){
    var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso||'').slice(0,10));
    if(!m)return String(iso||'');
    var d=new Date(m[1]+'-'+m[2]+'-'+m[3]+'T12:00:00');
    return WD[d.getDay()]+', '+parseInt(m[3],10)+'. '+MON[d.getMonth()]+' '+m[1];
  }
  function _dShort(iso){var p=String(iso||'').slice(0,10).split('-');return p.length===3?(p[2]+'.'+p[1]+'.'+p[0]):String(iso||'');}

  // ── Druckfenster: A4-Poster ──
  function print(data){
    data=data||{};
    var org=_org();
    var b=_brand();
    var firma=(org&&org.name)||'';
    var logo=(org&&(org.logoVector||org.logo))||'';
    var mehrTag=data.datumBis&&data.datumBis!==data.datum;
    var datumZeile=mehrTag?(_dLong(data.datum)+' bis '+_dLong(data.datumBis)):_dLong(data.datum);
    var zeitZeile=(mehrTag?'jeweils ':'')+'von '+esc(data.von)+' bis '+esc(data.bis)+' Uhr';
    var w=window.open('','_blank');
    if(!w){alert('Popup blockiert — bitte Popups für GEMA erlauben.');return;}
    w.document.write('<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Aushang — '+esc(data.titel||'Mitteilung')+'</title>'
      +'<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700;9..40,800;9..40,900&display=swap" rel="stylesheet">'
      +'<style>'
      +'*{box-sizing:border-box;margin:0;padding:0}'
      +'html{-webkit-print-color-adjust:exact;print-color-adjust:exact}'
      // opsz-14-Kanon (CLAUDE.md «DM-Sans l wird zu dick im PDF-Export»)
      +'body{font-family:"DM Sans",system-ui,-apple-system,sans-serif;font-optical-sizing:auto;font-variation-settings:"opsz" 14;background:#e8ebf0;padding:18px;color:#000}'
      +'@page{size:A4 portrait;margin:0}'
      +'.sheet{width:210mm;min-height:297mm;max-width:calc(100vw - 36px);margin:0 auto;background:#fff;box-shadow:0 10px 34px rgba(15,23,42,.22);border-radius:4px;padding:20mm 18mm 16mm;display:flex;flex-direction:column}'
      +'.kopf{display:flex;align-items:center;justify-content:space-between;gap:10mm;border-bottom:1.2mm solid '+b.acc+';padding-bottom:5mm}'
      +'.kopf .firma{font-size:13pt;font-weight:800;color:#000}'
      +'.kopf img{max-height:15mm;max-width:62mm;object-fit:contain;object-position:right center}'
      +'.eyebrow{margin-top:9mm;font-size:12.5pt;font-weight:900;letter-spacing:3.5px;text-transform:uppercase;color:'+b.acc+'}'
      +'.titel{font-size:33pt;font-weight:900;line-height:1.08;margin-top:2.5mm;color:#000}'
      +'.objekt{margin-top:3mm;font-size:12.5pt;font-weight:700;color:#333}'
      +'.zeitbox{margin-top:8mm;background:'+b.tint+';border:0.6mm solid '+b.acc+';border-radius:4mm;padding:7mm 8mm;text-align:center}'
      +'.zb-datum{font-size:19pt;font-weight:900;color:#000}'
      +'.zb-zeit{font-size:16.5pt;font-weight:800;margin-top:1.5mm;color:'+b.acc+'}'
      +'.text{margin-top:8mm;font-size:13.5pt;line-height:1.75;white-space:pre-line;color:#000}'
      +'.zusatz{margin-top:7mm;border:0.5mm solid #f2c14e;background:#fffaeb;border-radius:3mm;padding:5mm 6mm;font-size:12.5pt;line-height:1.6;white-space:pre-line;color:#000}'
      +'.zusatz b{display:block;margin-bottom:1mm}'
      +'.fuss{margin-top:auto;padding-top:6mm;border-top:0.35mm solid #cbd5e1}'
      +'.fuss .gruss{font-size:12.5pt;line-height:1.6;color:#000}'
      +'.fuss .kontakt{margin-top:2.5mm;font-size:11.5pt;color:#333}'
      +'.fuss .meta{margin-top:4mm;font-size:8.5pt;color:#94a3b8}'
      +'.nb{position:fixed;top:10px;right:10px;display:flex;gap:8px;z-index:50}'
      +'.nb button{padding:9px 16px;border-radius:9px;border:1px solid #ccc;background:#fff;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 2px 10px rgba(0,0,0,.12)}'
      +'.nb .p{background:'+b.acc+';color:#fff;border-color:'+b.acc+'}'
      +'@media print{.nb{display:none}body{background:none;padding:0}.sheet{width:auto;max-width:none;min-height:0;margin:0;box-shadow:none;border-radius:0;padding:20mm 18mm 16mm}}'
      +'</style></head><body>'
      +'<div class="nb"><button class="p" onclick="window.print()">🖨 Drucken / Als PDF sichern</button><button onclick="window.close()">Schliessen</button></div>'
      +'<div class="sheet">'
      +'<div class="kopf"><div class="firma">'+esc(firma)+'</div>'+(logo?'<img src="'+esc(logo)+'" alt=""/>':'')+'</div>'
      +'<div class="eyebrow">Wichtige Mitteilung</div>'
      +'<div class="titel">'+esc(data.titel||'Mitteilung')+'</div>'
      +(data.objekt?'<div class="objekt">🏠 '+esc(data.objekt)+'</div>':'')
      +'<div class="zeitbox"><div class="zb-datum">'+esc(datumZeile)+'</div><div class="zb-zeit">'+zeitZeile+'</div></div>'
      +'<div class="text">'+esc(data.text||'')+'</div>'
      +(String(data.zusatz||'').trim()?'<div class="zusatz"><b>❗ Bitte beachten</b>'+esc(data.zusatz)+'</div>':'')
      +'<div class="fuss">'
      +'<div class="gruss">Freundliche Grüsse<br><b>'+esc(firma)+'</b></div>'
      +(String(data.kontakt||'').trim()?'<div class="kontakt">Bei Fragen erreichen Sie uns unter: <b>'+esc(data.kontakt)+'</b></div>':'')
      +'<div class="meta">Aushang erstellt am '+esc(_dShort(_today()))+(firma?' · '+esc(firma):'')+'</div>'
      +'</div>'
      +'</div></body></html>');
    w.document.close();
    return w;
  }

  // ── Dialog ──
  var _ctx=null;
  function _ensure(){
    if(document.getElementById('gausModal'))return;
    var st=document.createElement('style');
    st.id='gausCss';
    st.textContent='#gausModal{position:fixed;inset:0;z-index:11000;background:rgba(8,20,40,.6);backdrop-filter:blur(5px);display:none;align-items:flex-end;justify-content:center}'
      +'#gausModal.open{display:flex}'
      +'@media(min-width:640px){#gausModal{align-items:center;padding:20px}}'
      +'.gaus-card{background:var(--sur,#fff);width:100%;max-width:620px;max-height:92vh;border-radius:18px 18px 0 0;display:flex;flex-direction:column;overflow:hidden}'
      +'@media(min-width:640px){.gaus-card{border-radius:18px}}'
      +'.gaus-hd{display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--brd,#e2e8f0)}'
      +'.gaus-hd h3{font-size:16px;font-weight:800;flex:1;margin:0}'
      +'.gaus-x{width:34px;height:34px;border-radius:9px;border:1px solid var(--brd2,#cbd5e1);background:var(--sur,#fff);font-weight:900;cursor:pointer;font-family:inherit}'
      +'.gaus-bd{padding:14px 18px;overflow-y:auto;-webkit-overflow-scrolling:touch}'
      +'.gaus-ft{display:flex;gap:8px;flex-wrap:wrap;padding:12px 18px;border-top:1px solid var(--brd,#e2e8f0)}'
      +'.gaus-fld{margin-bottom:10px}'
      +'.gaus-fld label{display:block;font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;color:var(--mut,#64748b);margin-bottom:4px}'
      +'.gaus-fld input,.gaus-fld select,.gaus-fld textarea{width:100%;padding:9px 11px;border:1.5px solid var(--brd2,#cbd5e1);border-radius:9px;font-size:14px;font-family:inherit;background:var(--sur,#fff);color:inherit}'
      +'.gaus-fld textarea{resize:vertical;line-height:1.55}'
      +'.gaus-row{display:flex;gap:10px}'
      +'.gaus-row .gaus-fld{flex:1;min-width:0}'
      +'.gaus-btn{padding:10px 15px;border-radius:10px;border:1px solid var(--brd2,#cbd5e1);background:var(--sur,#fff);font-weight:800;font-size:13.5px;cursor:pointer;font-family:inherit;color:inherit;min-height:42px}'
      +'.gaus-btn.pri{background:#16a34a;border-color:#16a34a;color:#fff}'
      +'.gaus-err{display:none;background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;border-radius:9px;padding:8px 11px;font-size:12.5px;font-weight:700;margin-bottom:10px}'
      +'.gaus-hint{font-size:11.5px;color:var(--mut,#64748b);margin-top:3px}';
    document.head.appendChild(st);
    var m=document.createElement('div');
    m.id='gausModal';
    m.innerHTML='<div class="gaus-card">'
      +'<div class="gaus-hd"><h3>📌 Aushang erstellen (Mieter-Info)</h3><button type="button" class="gaus-x" id="gausX">✕</button></div>'
      +'<div class="gaus-bd">'
      +'<div class="gaus-err" id="gausErr"></div>'
      +'<div class="gaus-fld"><label>Vorlage</label><select id="gausVorlage"></select><div class="gaus-hint">Vorlagen-Wechsel ersetzt Titel + Text — Zeit und Zusatzinfos bleiben.</div></div>'
      +'<div class="gaus-fld"><label>Titel auf dem Aushang</label><input id="gausTitel" type="text" placeholder="z.B. Wasserabstellung"/></div>'
      +'<div class="gaus-fld"><label>Liegenschaft / Adresse (optional)</label><input id="gausObjekt" type="text" placeholder="z.B. Musterstrasse 12, 4000 Basel"/></div>'
      +'<div class="gaus-row">'
      +'<div class="gaus-fld"><label>Datum *</label><input id="gausDatum" type="date"/></div>'
      +'<div class="gaus-fld"><label>bis (bei mehreren Tagen)</label><input id="gausDatumBis" type="date"/></div>'
      +'</div>'
      +'<div class="gaus-row">'
      +'<div class="gaus-fld"><label>Zeit von *</label><input id="gausVon" type="time"/></div>'
      +'<div class="gaus-fld"><label>Zeit bis *</label><input id="gausBis" type="time"/></div>'
      +'</div>'
      +'<div class="gaus-fld"><label>Text</label><textarea id="gausText" rows="7"></textarea></div>'
      +'<div class="gaus-fld"><label>Zusätzliche Infos (optional — gelbe Box)</label><textarea id="gausZusatz" rows="2" placeholder="z.B. Bitte den Zugang zum Keller freihalten / Fahrzeuge vor der Garage umparkieren"></textarea></div>'
      +'<div class="gaus-fld"><label>Kontakt bei Fragen</label><input id="gausKontakt" type="text" placeholder="z.B. Muster Haustechnik AG, 061 111 22 33"/></div>'
      +'</div>'
      +'<div class="gaus-ft">'
      +'<button type="button" class="gaus-btn pri" id="gausPrint">🖨 Aushang drucken (PDF)</button>'
      +'<button type="button" class="gaus-btn" id="gausSaveVorlage" title="Titel + Text als org-weite Vorlage speichern">💾 Als Vorlage speichern</button>'
      +'<button type="button" class="gaus-btn" id="gausCancel">Abbrechen</button>'
      +'</div></div>';
    document.body.appendChild(m);
    document.getElementById('gausX').addEventListener('click',close);
    document.getElementById('gausCancel').addEventListener('click',close);
    m.addEventListener('click',function(e){if(e.target===m)close();});
    document.getElementById('gausVorlage').addEventListener('change',function(){_applyVorlage(this.value);});
    document.getElementById('gausPrint').addEventListener('click',_doPrint);
    document.getElementById('gausSaveVorlage').addEventListener('click',_doSaveVorlage);
  }
  function close(){var m=document.getElementById('gausModal');if(m)m.classList.remove('open');_ctx=null;}
  function _err(msg){
    var e=document.getElementById('gausErr');
    if(!msg){e.style.display='none';return;}
    e.textContent=msg;e.style.display='block';
  }
  function _applyVorlage(id){
    var v=_vorlageById(id);
    if(!v)return;
    document.getElementById('gausTitel').value=v.titel||v.name;
    document.getElementById('gausText').value=v.text||'';
  }
  function _kontaktDefault(){
    var org=_org();
    var s=(org&&org.settings&&org.settings.erp)||{};
    var teile=[];
    if(s.name||org&&org.name)teile.push(s.name||org.name);
    if(s.tel)teile.push(s.tel);
    return teile.join(', ');
  }
  function open(opts){
    opts=opts||{};
    _ensure();
    _ctx=opts;
    var vl=vorlagen();
    var g=opts.gespeichert||null;
    var vid=(g&&g.vorlageId)||opts.vorlageId||vl[0].id;
    if(!_vorlageById(vid))vid=vl[0].id;
    document.getElementById('gausVorlage').innerHTML=vl.map(function(v){
      return '<option value="'+esc(v.id)+'"'+(v.id===vid?' selected':'')+'>'+esc((v.ic?v.ic+' ':'')+v.name)+'</option>';
    }).join('');
    var v=_vorlageById(vid)||vl[0];
    document.getElementById('gausTitel').value=(g&&g.titel)||v.titel||v.name;
    document.getElementById('gausText').value=(g&&g.text!=null)?g.text:(v.text||'');
    document.getElementById('gausObjekt').value=(g&&g.objekt)||opts.objektName||'';
    document.getElementById('gausDatum').value=(g&&g.datum)||opts.datum||_today();
    document.getElementById('gausDatumBis').value=(g&&g.datumBis)||opts.datumBis||'';
    document.getElementById('gausVon').value=(g&&g.von)||opts.von||'';
    document.getElementById('gausBis').value=(g&&g.bis)||opts.bis||'';
    document.getElementById('gausZusatz').value=(g&&g.zusatz)||'';
    document.getElementById('gausKontakt').value=(g&&g.kontakt)||_kontaktDefault();
    _err('');
    document.getElementById('gausModal').classList.add('open');
  }
  function _collect(){
    return {
      vorlageId:document.getElementById('gausVorlage').value,
      titel:document.getElementById('gausTitel').value.trim(),
      text:document.getElementById('gausText').value,
      zusatz:document.getElementById('gausZusatz').value,
      objekt:document.getElementById('gausObjekt').value.trim(),
      datum:document.getElementById('gausDatum').value,
      datumBis:document.getElementById('gausDatumBis').value,
      von:document.getElementById('gausVon').value,
      bis:document.getElementById('gausBis').value,
      kontakt:document.getElementById('gausKontakt').value.trim(),
      gedrucktAm:new Date().toISOString()
    };
  }
  function _doPrint(){
    var d=_collect();
    if(!d.titel){_err('Bitte einen Titel angeben.');return;}
    if(!d.datum){_err('Bitte das Datum angeben.');return;}
    if(!d.von||!d.bis){_err('Die Zeitangabe von–bis ist Pflicht — sie steht gross auf dem Aushang.');return;}
    _err('');
    var ctx=_ctx;
    print(d);
    try{if(ctx&&typeof ctx.onSave==='function')ctx.onSave(d);}catch(e){}
    close();
  }
  function _doSaveVorlage(){
    var d=_collect();
    if(!d.titel||!String(d.text||'').trim()){_err('Titel und Text angeben, um sie als Vorlage zu speichern.');return;}
    _err('');
    var selId=d.vorlageId;
    var sel=_vorlageById(selId);
    function persist(id,name,ic){
      try{
        var org=_org();
        if(!org||!window.GemaAuth||!GemaAuth.updateOrgSettings){_err('Vorlagen-Speicherung nicht verfügbar (keine Organisation).');return;}
        var st=org.settings||{};
        st.aushang=st.aushang||{};
        var list=Array.isArray(st.aushang.vorlagen)?st.aushang.vorlagen.slice():[];
        var i=-1;list.forEach(function(x,ix){if(x&&x.id===id)i=ix;});
        var rec={id:id,ic:ic||'📌',name:name,titel:d.titel,text:d.text};
        if(i>=0)list[i]=rec;else list.push(rec);
        st.aushang.vorlagen=list;
        GemaAuth.updateOrgSettings(org.id,st);
        _err('');
        var e=document.getElementById('gausErr');
        e.style.display='block';e.style.background='#f0fdf4';e.style.borderColor='#bbf7d0';e.style.color='#16a34a';
        e.textContent='✓ Vorlage «'+name+'» gespeichert (org-weit).';
        setTimeout(function(){e.style.display='none';e.style.background='';e.style.borderColor='';e.style.color='';},2600);
        // Select nachführen
        var vl=vorlagen();
        document.getElementById('gausVorlage').innerHTML=vl.map(function(v){
          return '<option value="'+esc(v.id)+'"'+(v.id===id?' selected':'')+'>'+esc((v.ic?v.ic+' ':'')+v.name)+'</option>';
        }).join('');
      }catch(e){_err('Vorlage konnte nicht gespeichert werden.');}
    }
    function slug(name){
      var s='aus_'+String(name).toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,24);
      return s==='aus_'?('aus_'+Date.now().toString(36)):s;
    }
    if(window.GemaDialog&&GemaDialog.confirm&&sel){
      GemaDialog.confirm({
        title:'Als Vorlage speichern',
        message:'Bestehende Vorlage «'+sel.name+'» mit dem aktuellen Titel + Text überschreiben?\n\n«Abbrechen» legt stattdessen eine NEUE Vorlage an.',
        confirmLabel:'«'+sel.name+'» überschreiben'
      }).then(function(ok){
        if(ok){persist(sel.id,sel.name,sel.ic);return;}
        if(GemaDialog.prompt){
          GemaDialog.prompt({title:'Neue Vorlage',placeholder:'Name der Vorlage (z.B. Wasserabstellung Kurzversion)'}).then(function(name){
            if(!name||!name.trim())return;
            persist(slug(name),name.trim(),'📌');
          });
        }
      });
    } else if(sel){
      persist(sel.id,sel.name,sel.ic);
    }
  }

  window.GemaAushang={open:open,close:close,print:print,vorlagen:vorlagen,DEFAULTS:DEFAULTS,
    _hooks:{applyVorlage:_applyVorlage,collect:_collect,dLong:_dLong,brand:_brand}};
})();
