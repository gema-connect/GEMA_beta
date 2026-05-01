/**
 * gema_pdf.js — GEMA PDF Export v2
 * Exportiert die aktuelle Ansicht als PDF — genau wie sichtbar.
 * Blendet Buttons/Nav aus, fügt Seitenzahlen hinzu.
 */
(function(w){
  'use strict';

  var JSPDF_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  var H2C_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';

  function _ensure(src){
    return new Promise(function(res){
      if(src.includes('jspdf') && w.jspdf) { res(); return; }
      if(src.includes('html2canvas') && typeof html2canvas==='function') { res(); return; }
      var s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=res;
      document.head.appendChild(s);
    });
  }

  async function exportPDF(opts){
    opts = opts || {};
    var title = opts.title || document.title.replace(/GEMA/g,'').replace(/[–—]/g,'').trim() || 'GEMA';
    var orientation = opts.orientation || 'portrait';

    _toast('\ud83d\udcc4 PDF wird erstellt\u2026');

    await _ensure(JSPDF_CDN);
    await _ensure(H2C_CDN);

    if(!w.jspdf || typeof html2canvas!=='function'){
      _toast('\u26a0 PDF-Bibliothek nicht verf\u00fcgbar');
      return;
    }

    // Hide non-print elements
    var hidden = [];
    var hideSelectors = [
      '.no-print','.gema-feedback-btn','.gema-nav','.nav','nav',
      '#gfb-root','#gToast','#gToast_pdf',
      '.obj-combo-toggle',
      'button.nb','button.g-btn','button.btn',
      '.gema-hamburger','.gema-menu-overlay','.gema-menu-panel',
      '.pk-confirm','.anlagen-section button',
      '[onclick*="Offerte"]','[onclick*="offerte"]',
      '[onclick*="GemaOfferRequest"]',
      '.gaw-card button','.gaw-uebernehmen',
      '.footer-bar','.tb-search-toggle','.tb-search-mob',
      '#pwaInstallBanner','.hero-actions','.hero-pills',
      '.stat-card','.stats-row','.kpi-row','.toolbar','.filter-bar',
      '#feedbackBtn','.wz-role-badge',
      '.tc-foot','.tc-actions','.v-card-footer'
    ];
    hideSelectors.forEach(function(sel){
      try{
        document.querySelectorAll(sel).forEach(function(el){
          if(el.offsetParent!==null||getComputedStyle(el).display!=='none'){
            hidden.push({el:el,prev:el.style.cssText});
            el.style.setProperty('display','none','important');
          }
        });
      }catch(e){}
    });

    // Show manual input for project name in PDF
    var comboManual=document.getElementById('objComboManual');
    var comboSelect=document.getElementById('objComboSelect');
    var swapped=false;
    if(comboManual&&comboSelect&&comboManual.style.display==='none'){
      comboManual.style.display='flex';
      comboSelect.style.display='none';
      swapped=true;
    }

    var container=document.querySelector('.g-page')||document.querySelector('.main')||document.querySelector('main')||document.body;

    // Force desktop width for consistent PDF on all devices
    var origWidth=container.style.width;
    var origMaxWidth=container.style.maxWidth;
    var origMinWidth=container.style.minWidth;
    container.style.width='1100px';
    container.style.maxWidth='1100px';
    container.style.minWidth='1100px';

    try{
      var canvas=await html2canvas(container,{
        scale:2.5, useCORS:true, allowTaint:true, logging:false, backgroundColor:'#ffffff',
        width:1100, windowWidth:1200
      });

      var jsPDF=w.jspdf.jsPDF;
      var doc=new jsPDF({unit:'mm',format:'a4',orientation:orientation});
      var pw=doc.internal.pageSize.getWidth();
      var ph=doc.internal.pageSize.getHeight();
      var M=8;
      var Mtop=22;   // Header-Band-H\u00f6he
      var Mbot=12;   // Footer-Band-H\u00f6he
      var contentW=pw-M*2;
      var imgRatio=canvas.height/canvas.width;
      var totalImgH=contentW*imgRatio;
      var pageH=ph-Mtop-Mbot;

      var srcW=canvas.width, srcH=canvas.height;
      var sliceHpx=Math.floor(srcH*(pageH/totalImgH));
      var yPx=0, pageNum=0;

      // Smart page breaks: avoid cutting in the last 8% of a page (orphan prevention)
      var orphanThreshold=Math.floor(sliceHpx*0.08);

      while(yPx<srcH){
        if(pageNum>0) doc.addPage();
        var remaining=srcH-yPx;
        var thisH=Math.min(sliceHpx,remaining);
        // If last slice is very small (<8% of page), merge with previous
        if(remaining>sliceHpx&&remaining-sliceHpx<orphanThreshold){
          thisH=Math.floor(remaining/2);
        }
        var sc=document.createElement('canvas');
        sc.width=srcW; sc.height=thisH;
        sc.getContext('2d').drawImage(canvas,0,yPx,srcW,thisH,0,0,srcW,thisH);
        var sliceImgH=(thisH/srcW)*contentW;
        doc.addImage(sc.toDataURL('image/jpeg',0.95),'JPEG',M,Mtop,contentW,sliceImgH);
        yPx+=thisH; pageNum++;
      }

      // Restore container width
      container.style.width=origWidth;
      container.style.maxWidth=origMaxWidth;
      container.style.minWidth=origMinWidth;

      // ==== Projekt-Metadaten sammeln ====
      var meta=_collectMeta(opts);

      // ==== Header + Footer auf jede Seite zeichnen ====
      var total=doc.internal.getNumberOfPages();
      var orgLogo=null, orgName='';
      try{
        if(typeof GemaAuth!=='undefined'){
          var org=GemaAuth.getCurrentOrg();
          if(org){ if(org.logo) orgLogo=org.logo; orgName=org.name||''; }
        }
      }catch(e){}

      for(var p=1;p<=total;p++){
        doc.setPage(p);
        _drawHeader(doc, pw, M, Mtop, meta, orgLogo, orgName, title);
        _drawFooter(doc, pw, ph, M, Mbot, meta, p, total);
      }

      var projekt=meta.projekt||'';
      var fn=title.replace(/[^\w\- ]+/g,'').replace(/\s+/g,'_');
      if(meta.projektnummer) fn=meta.projektnummer.replace(/[^\w\-]+/g,'_')+'_'+fn;
      if(projekt) fn+='_'+projekt.substring(0,25).replace(/[^\w\- ]+/g,'').replace(/\s+/g,'_');
      doc.save(fn+'.pdf');
      _toast('\u2713 PDF erstellt');
    }catch(e){
      console.error('[GemaPDF]',e);
      _toast('\u26a0 PDF-Fehler: '+e.message);
    }finally{
      container.style.width=origWidth;
      container.style.maxWidth=origMaxWidth;
      container.style.minWidth=origMinWidth;
      hidden.forEach(function(h){h.el.style.cssText=h.prev;});
      if(swapped){comboManual.style.display='none';comboSelect.style.display='flex';}
    }
  }

  // ==== Meta-Sammlung aus DOM + GemaObjekte ====
  function _collectMeta(opts){
    var m={projekt:'',projektnummer:'',revision:'',bearbeiter:'',datum:'',norm:''};
    function val(id){ var el=document.getElementById(id); return el?(el.value||'').trim():''; }
    // Aktives Objekt aus GemaObjekte API
    var obj=null;
    try{ if(typeof GemaObjekte!=='undefined') obj=GemaObjekte.getActive(); }catch(e){}
    // Projekt-Name: Manueller Input gewinnt, sonst Objekt-Name
    m.projekt = val('metaProjekt') || (obj?obj.name:'') || '';
    // Projektnummer: explicit input \u00fcberschreibt, sonst aus Objekt
    m.projektnummer = val('metaProjektnr') || (obj&&obj.projektnummer?obj.projektnummer:'') || '';
    // Revision: explicit input, sonst aus Objekt
    m.revision = val('metaRevision') || (obj&&obj.revision?obj.revision:'') || '';
    // Bearbeiter
    m.bearbeiter = val('metaBearbeiter');
    // Datum
    var d=val('metaDatum');
    if(d){
      try{
        var parts=d.split('-');
        if(parts.length===3) d=parts[2]+'.'+parts[1]+'.'+parts[0];
      }catch(e){}
      m.datum=d;
    } else {
      var now=new Date();
      m.datum=String(now.getDate()).padStart(2,'0')+'.'+String(now.getMonth()+1).padStart(2,'0')+'.'+now.getFullYear();
    }
    // Norm: aus .gema-hero-norm oder .hero-norm Element
    try{
      var nEl=document.querySelector('.gema-hero-norm,.hero-norm');
      if(nEl){
        var t=(nEl.textContent||'').trim();
        // \ud83d\udcd6-Emoji entfernen
        m.norm = t.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\s*/u,'').trim();
      }
    }catch(e){}
    if(opts && opts.norm) m.norm = opts.norm;
    return m;
  }

  // ==== Header-Band auf einer Seite zeichnen ====
  function _drawHeader(doc, pw, M, Mtop, meta, orgLogo, orgName, title){
    // Trennlinie unten am Header
    doc.setDrawColor(220); doc.setLineWidth(0.2);
    doc.line(M, Mtop-2, pw-M, Mtop-2);
    // Logo links
    var logoW=0;
    if(orgLogo){
      try{ doc.addImage(orgLogo,'JPEG',M,3,16,16*0.6); logoW=18; }catch(e){}
    }
    // Modul-Titel + Projekt center-left
    doc.setFontSize(11); doc.setTextColor(15,23,42); doc.setFont(undefined,'bold');
    doc.text(title||'GEMA', M+logoW, 7);
    doc.setFontSize(8.5); doc.setTextColor(80); doc.setFont(undefined,'normal');
    var projLine=meta.projekt||'\u2014';
    if(meta.projektnummer) projLine='Nr. '+meta.projektnummer+'  \u00b7  '+projLine;
    // Auf max. (pw - M - 65) Breite k\u00fcrzen f\u00fcr Meta-Spalte rechts
    var maxLeftW = pw - M - 65 - (M+logoW);
    projLine=_truncate(doc, projLine, maxLeftW);
    doc.text(projLine, M+logoW, 12);
    // Norm-Pill darunter (klein)
    if(meta.norm){
      doc.setFontSize(7.5); doc.setTextColor(120);
      doc.text('\ud83d\udcd6 '+meta.norm, M+logoW, 16.5);
    }
    // Rechte Spalte: Bearbeiter / Datum / Revision
    doc.setFontSize(8); doc.setTextColor(80);
    var rx = pw - M;
    var ry = 6;
    if(meta.bearbeiter){ doc.text('Bearbeiter: '+_truncate(doc, meta.bearbeiter, 60), rx, ry, {align:'right'}); ry+=4; }
    if(meta.datum){     doc.text('Datum: '+meta.datum, rx, ry, {align:'right'}); ry+=4; }
    if(meta.revision){  doc.text('Revision: '+meta.revision, rx, ry, {align:'right'}); ry+=4; }
    if(orgName && ry<18){
      doc.setFontSize(7); doc.setTextColor(150);
      doc.text(orgName, rx, ry, {align:'right'});
    }
    // Reset
    doc.setFont(undefined,'normal'); doc.setTextColor(0);
  }

  // ==== Footer mit Seitenzahl + Norm ====
  function _drawFooter(doc, pw, ph, M, Mbot, meta, p, total){
    doc.setDrawColor(220); doc.setLineWidth(0.2);
    doc.line(M, ph-Mbot+2, pw-M, ph-Mbot+2);
    doc.setFontSize(7.5); doc.setTextColor(150);
    var stamp='Erstellt mit GEMA \u00b7 gema-suite.ch';
    if(meta.projektnummer) stamp += '  \u00b7  Projekt-Nr. '+meta.projektnummer;
    doc.text(stamp, M, ph-5);
    doc.text('Seite '+p+' / '+total, pw-M, ph-5, {align:'right'});
  }

  function _truncate(doc, text, maxMm){
    if(!text) return '';
    var w = doc.getStringUnitWidth(text) * doc.internal.getFontSize() / doc.internal.scaleFactor;
    if(w<=maxMm) return text;
    var t=text;
    while(t.length>3){
      t=t.slice(0,-1);
      var ww=doc.getStringUnitWidth(t+'\u2026') * doc.internal.getFontSize() / doc.internal.scaleFactor;
      if(ww<=maxMm) return t+'\u2026';
    }
    return t;
  }

  var _toastEl=null,_toastTimer;
  function _toast(msg){
    _toastEl=document.getElementById('gToast')||document.getElementById('gToast_pdf');
    if(!_toastEl){
      _toastEl=document.createElement('div');_toastEl.id='gToast_pdf';
      Object.assign(_toastEl.style,{position:'fixed',bottom:'24px',left:'50%',transform:'translateX(-50%)',background:'#0f172a',color:'#fff',padding:'10px 20px',borderRadius:'10px',fontSize:'13px',fontWeight:'600',zIndex:'9999',boxShadow:'0 4px 20px rgba(0,0,0,.3)',opacity:'0',transition:'opacity .3s',pointerEvents:'none'});
      document.body.appendChild(_toastEl);
    }
    _toastEl.textContent=msg;_toastEl.style.opacity='1';
    clearTimeout(_toastTimer);_toastTimer=setTimeout(function(){_toastEl.style.opacity='0';},3000);
  }

  w.GemaPDF={export:exportPDF};
})(window);
