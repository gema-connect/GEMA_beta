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
      'button.nb','button.g-btn','button.btn'
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

    try{
      var canvas=await html2canvas(container,{
        scale:2, useCORS:true, allowTaint:true, logging:false, backgroundColor:'#ffffff'
      });

      var jsPDF=w.jspdf.jsPDF;
      var doc=new jsPDF({unit:'mm',format:'a4',orientation:orientation});
      var pw=doc.internal.pageSize.getWidth();
      var ph=doc.internal.pageSize.getHeight();
      var M=8;
      var contentW=pw-M*2;
      var imgRatio=canvas.height/canvas.width;
      var totalImgH=contentW*imgRatio;
      var pageH=ph-M*2-6;

      var srcW=canvas.width, srcH=canvas.height;
      var sliceHpx=Math.floor(srcH*(pageH/totalImgH));
      var yPx=0, pageNum=0;

      while(yPx<srcH){
        if(pageNum>0) doc.addPage();
        var thisH=Math.min(sliceHpx,srcH-yPx);
        var sc=document.createElement('canvas');
        sc.width=srcW; sc.height=thisH;
        sc.getContext('2d').drawImage(canvas,0,yPx,srcW,thisH,0,0,srcW,thisH);
        var sliceImgH=(thisH/srcW)*contentW;
        doc.addImage(sc.toDataURL('image/jpeg',0.92),'JPEG',M,M,contentW,sliceImgH);
        yPx+=thisH; pageNum++;
      }

      // Page numbers + org logo
      var total=doc.internal.getNumberOfPages();
      var orgLogo=null;
      try{
        if(typeof GemaAuth!=='undefined'){
          var org=GemaAuth.getCurrentOrg();
          if(org&&org.logo) orgLogo=org.logo;
        }
      }catch(e){}
      for(var p=1;p<=total;p++){
        doc.setPage(p);
        // Org logo top-left
        if(orgLogo){
          try{doc.addImage(orgLogo,'JPEG',M,2,18,18*0.6);}catch(e){}
        }
        doc.setFontSize(8); doc.setTextColor(160);
        doc.text('Seite '+p+'/'+total, pw-M-18, ph-4);
      }

      var projekt=document.getElementById('metaProjekt')?.value||'';
      var fn=title.replace(/[^\w\- ]+/g,'').replace(/\s+/g,'_');
      if(projekt) fn+='_'+projekt.substring(0,25).replace(/[^\w\- ]+/g,'').replace(/\s+/g,'_');
      doc.save(fn+'.pdf');
      _toast('\u2713 PDF erstellt');
    }catch(e){
      console.error('[GemaPDF]',e);
      _toast('\u26a0 PDF-Fehler: '+e.message);
    }finally{
      hidden.forEach(function(h){h.el.style.cssText=h.prev;});
      if(swapped){comboManual.style.display='none';comboSelect.style.display='flex';}
    }
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
