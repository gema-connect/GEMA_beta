/* ══════════════════════════════════════════════════════════════════════════
   GEMA Rich-Text — geteilter Helfer für Berichts-Textfelder
   ══════════════════════════════════════════════════════════════════════════
   Feedback 24.08.2026 (Kaspar Fluck, Dachbericht):
     «Möglichkeit Absätze zu machen und möglichkeit Text Fett, Unterstrichen
      oder kursiv zu gestalten»

   Zweck: aus einem <textarea> wird ein contenteditable-Feld mit Fett / Kursiv /
   Unterstrichen und ECHTEN Absätzen. Gespeichert wird sanitisiertes HTML;
   Anzeige UND PDF laufen durch denselben Sanitizer.

   WARUM EIN EIGENER HELFER UND NICHT DIE FASSUNG AUS pm_erp.html:
   Jene ist an die Positions-Zelle gebunden (erpCellSet, feste Aktionsleiste,
   Schriftgrösse/Farbe in pt) und flacht Absätze bewusst auf einzelne <br> ab —
   eine Offert-Position ist eine Tabellenzelle. Ein Berichts-Textfeld braucht
   das Gegenteil: mehrere Absätze, keine Schriftgrössen (die Typografie macht
   der Bericht), und eine Toolbar, die zum gerade bearbeiteten Feld gehört.
   pm_erp bleibt darum unangetastet.

   SICHERHEIT (identische Regel wie dort, KRITISCH):
   Fremd-HTML wird NIE via innerHTML geparst — ein losgelöstes <div> führt zwar
   kein <script> aus, lädt aber <img src=x> und feuert dessen onerror; damit
   liefe eingeschleuster Code schon beim blossen Sanitisieren. DOMParser
   erzeugt ein INERTES Dokument.

   API
     GemaRichtext.sanitize(html)          → sicheres HTML (Whitelist)
     GemaRichtext.toPlain(html)           → Klartext mit \n (für KI/CSV/Suche)
     GemaRichtext.istRich(s)              → sieht der String nach Formatierung aus?
     GemaRichtext.fromPlain(text)         → Klartext → HTML (Absätze bleiben)
     GemaRichtext.editorHtml(id,wert,opt) → Markup für ein Editor-Feld
     GemaRichtext.onChange(fn)            → fn(id, html) bei jeder Eingabe
     GemaRichtext.setWert(id, html)       → Feld im DOM nachziehen (z.B. nach KI)

   Die Editor-Felder tragen `data-gr="<id>"`. Alle Listener hängen DELEGIERT am
   document — nur so überleben sie das vollständige Neuzeichnen der Detail-
   Ansicht (der Dachbericht baut sein Markup bei jedem render() neu auf).
   ══════════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  if(window.GemaRichtext) return;

  /* ── Sanitizer ──────────────────────────────────────────────────────── */
  var TAGS  = {B:1,STRONG:1,I:1,EM:1,U:1,S:1,SPAN:1};
  var STYLE = {'font-weight':1,'font-style':1,'text-decoration':1,'text-decoration-line':1};
  // «Sieht nach Formatierung aus» — reiner Text (auch mit einem literalen «<»)
  // nimmt den billigen Escape-Weg und bleibt damit unverändert erhalten.
  var RICH_RE = /<(b|strong|i|em|u|s|span|font|br|div|p)\b|<br/i;

  function esc(s){
    return String(s==null?'':s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function safeStyle(s){
    if(!s) return '';
    var out=[];
    String(s).split(';').forEach(function(decl){
      var i=decl.indexOf(':'); if(i<0) return;
      var prop=decl.slice(0,i).trim().toLowerCase(), val=decl.slice(i+1).trim();
      if(!STYLE[prop]) return;
      if(/[<>{}]/.test(val)||/url\(|expression|javascript:|image-set|@import/i.test(val)) return;
      if(!/^[a-z0-9 .,%#()-]+$/i.test(val)) return;
      out.push(prop+':'+val);
    });
    return out.join(';');
  }

  function node(n){
    var out='';
    for(var i=0;i<n.childNodes.length;i++){
      var c=n.childNodes[i];
      if(c.nodeType===3){ out+=esc(c.nodeValue).replace(/\n/g,'<br>'); continue; }
      if(c.nodeType!==1) continue;
      var tag=c.tagName;
      // Inhalt dieser Tags wird komplett verworfen
      if(tag==='SCRIPT'||tag==='STYLE'||tag==='IFRAME'||tag==='OBJECT'||tag==='EMBED'||tag==='LINK'||tag==='META') continue;
      if(tag==='BR'){ out+='<br>'; continue; }
      // Absatz-Container werden zu <br> abgeflacht: EIN Format für Editor,
      // Anzeige und PDF — <br> rendert überall gleich, auch im Druckfenster
      // ohne white-space-Regeln.
      if(tag==='DIV'||tag==='P'){
        var inner=node(c);
        out += inner + (inner && !/<br>$/.test(inner) ? '<br>' : '');
        continue;
      }
      if(tag==='FONT'){ out += '<span>'+node(c)+'</span>'; continue; }   // execCommand-Altlast
      if(TAGS[tag]){
        var attr='';
        if(tag==='SPAN'){ var st=safeStyle(c.getAttribute&&c.getAttribute('style')); if(st) attr=' style="'+st+'"'; }
        var t=tag.toLowerCase();
        out += '<'+t+attr+'>'+node(c)+'</'+t+'>';
      } else {
        out += node(c);   // unbekanntes Tag: Inhalt behalten, Tag weg
      }
    }
    return out;
  }

  function sanitize(html){
    var s=String(html==null?'':html);
    if(!RICH_RE.test(s)) return esc(s).replace(/\n/g,'<br>');
    var doc=null;
    try{ doc=new DOMParser().parseFromString('<body>'+s,'text/html'); }catch(e){}
    var root=doc&&doc.body;
    if(!root){ root=document.createElement('div'); root.textContent=s; }
    // Leerzeilen werden NIE zusammengefasst: was jemand eingibt, steht im
    // Editor UND im Bericht genau so (Absätze sind der Kern dieses Feedbacks).
    return node(root);
  }

  function toPlain(html){
    var s=String(html==null?'':html);
    if(!RICH_RE.test(s)) return s;
    var doc=null;
    try{ doc=new DOMParser().parseFromString('<body>'+s.replace(/<br\s*\/?>/gi,'\n').replace(/<\/(div|p)>/gi,'\n'),'text/html'); }catch(e){}
    var root=doc&&doc.body;
    if(!root) return s;
    return (root.textContent||'').replace(/\n{3,}/g,'\n\n').replace(/[ \t]+\n/g,'\n').trim();
  }

  function fromPlain(text){
    return esc(String(text==null?'':text)).replace(/\n/g,'<br>');
  }

  function istRich(s){ return RICH_RE.test(String(s==null?'':s)); }

  /* ── Editor-Markup ──────────────────────────────────────────────────── */
  function editorHtml(id, wert, opts){
    opts=opts||{};
    var cls='gr-ed'+(opts.klein?' gr-ed--klein':'');
    var ro=opts.readonly?' data-gr-ro="1"':'';
    return '<div class="gr-wrap">'
      + '<div class="'+cls+'" data-gr="'+esc(id)+'"'+ro
        + (opts.readonly?'':' contenteditable="true"')
        + ' data-ph="'+esc(opts.placeholder||'')+'"'
        + (opts.minHeight?' style="min-height:'+parseInt(opts.minHeight,10)+'px"':'')
        + '>'+sanitize(wert)+'</div>'
      + '</div>';
  }

  /* ── Zustand + Callback ─────────────────────────────────────────────── */
  var aktiv=null;          // aktuelles Editor-Element
  var merk=null;           // gemerkter Auswahl-Bereich (Touch-Fall)
  var barHit=0;            // Zeitpunkt des letzten Toolbar-Griffs
  var cbs=[];
  function onChange(fn){ if(typeof fn==='function') cbs.push(fn); }
  function feuer(el){
    var id=el.getAttribute('data-gr'), html=sanitize(el.innerHTML);
    cbs.forEach(function(fn){ try{ fn(id, html); }catch(e){ console.warn('[GemaRichtext] onChange:',e); } });
  }
  function setWert(id, html){
    var el=document.querySelector('[data-gr="'+String(id).replace(/"/g,'\\"')+'"]');
    if(el) el.innerHTML=sanitize(html);
  }

  /* ── Schwebende Werkzeugleiste ──────────────────────────────────────
     EINE Leiste für alle Felder: die Textfelder des Berichts liegen über
     viele aufklappbare Abschnitte verteilt — eine feste Leiste am Seitenkopf
     wäre weit weg vom Feld, eine Leiste PRO Feld vervielfachte das Markup.
     Die schwebende Leiste sitzt immer direkt über dem Feld, das gerade
     bearbeitet wird. */
  var bar=null;
  function barEl(){
    if(bar) return bar;
    bar=document.createElement('div');
    bar.className='gr-bar';
    bar.setAttribute('role','toolbar');
    bar.innerHTML =
        '<button type="button" class="gr-b" data-gr-cmd="bold" title="Fett (Ctrl+B)"><b>F</b></button>'
      + '<button type="button" class="gr-b" data-gr-cmd="italic" title="Kursiv (Ctrl+I)"><i>K</i></button>'
      + '<button type="button" class="gr-b" data-gr-cmd="underline" title="Unterstrichen (Ctrl+U)"><u>U</u></button>'
      + '<span class="gr-sep"></span>'
      + '<button type="button" class="gr-b" data-gr-cmd="removeFormat" title="Formatierung entfernen">⌫</button>'
      + '<span class="gr-hint">Enter = neue Zeile · 2× Enter = Absatz</span>';
    document.body.appendChild(bar);
    return bar;
  }
  function barZeigen(el){
    var b=barEl();
    b.classList.add('is-on');
    var r=el.getBoundingClientRect();
    var top=r.top+window.scrollY-40;
    // Passt die Leiste oben nicht hin (Feld am Viewport-Anfang), rutscht sie
    // unter das Feld statt aus dem Bild zu laufen.
    if(r.top<48) top=r.bottom+window.scrollY+6;
    b.style.top=Math.max(4,top)+'px';
    b.style.left=Math.max(4,r.left+window.scrollX)+'px';
  }
  function barWeg(){ if(bar) bar.classList.remove('is-on'); }

  /* ── Auswahl merken (Touch/Safari) ──────────────────────────────────
     Der Tipper auf einen Werkzeug-Knopf hebt die Markierung auf, BEVOR der
     Klick-Handler läuft — deshalb wird nur eine ECHTE (nicht-leere) Auswahl
     gemerkt, und ein blosser Cursor überschreibt sie nie. */
  function merkeSel(){
    if(!aktiv) return;
    var s=window.getSelection(); if(!s||!s.rangeCount) return;
    var r=s.getRangeAt(0);
    if(r.collapsed||!aktiv.contains(r.commonAncestorContainer)) return;
    merk=r.cloneRange();
  }
  function liveRange(){
    if(!aktiv) return null;
    var s=window.getSelection();
    if(s&&s.rangeCount){ var r=s.getRangeAt(0); if(!r.collapsed&&aktiv.contains(r.commonAncestorContainer)) return r; }
    if(merk&&!merk.collapsed&&aktiv.contains(merk.commonAncestorContainer)) return merk;
    return null;
  }
  function restore(){
    if(!aktiv) return null;
    try{ aktiv.focus({preventScroll:true}); }catch(e){ try{ aktiv.focus(); }catch(_){} }
    var r=liveRange();
    if(r){ try{ var s=window.getSelection(); s.removeAllRanges(); s.addRange(r); }catch(e2){} }
    return r;
  }
  var STYLE_CMD={bold:['fontWeight','700'],italic:['fontStyle','italic'],underline:['textDecoration','underline']};
  function wrapStyle(prop,val){
    var r=liveRange(); if(!r) return;
    var span=document.createElement('span'); span.style[prop]=val;
    try{ r.surroundContents(span); }
    catch(e){ var f=r.extractContents(); span.appendChild(f); r.insertNode(span); }
    try{ var s=window.getSelection(); s.removeAllRanges(); var nr=document.createRange(); nr.selectNodeContents(span); s.addRange(nr); }catch(e2){}
  }
  function cmd(name){
    var r=restore(); if(!aktiv) return;
    var vor=aktiv.innerHTML;
    try{ document.execCommand(name,false,null); }catch(e){}
    // Ersatzweg: execCommand wirkt nur auf ein fokussiertes Feld mit lebender
    // Auswahl — auf Touch/Safari kommt der Klick an, ohne dass beides gilt.
    if(r&&aktiv.innerHTML===vor&&STYLE_CMD[name]) wrapStyle(STYLE_CMD[name][0],STYLE_CMD[name][1]);
    feuer(aktiv);
  }

  /* ── Delegierte Listener (überleben jedes Neuzeichnen) ──────────────── */
  document.addEventListener('focusin',function(e){
    var el=e.target&&e.target.closest&&e.target.closest('[data-gr]');
    if(!el||el.getAttribute('data-gr-ro')) return;
    aktiv=el; merk=null; barZeigen(el);
  });
  document.addEventListener('input',function(e){
    var el=e.target&&e.target.closest&&e.target.closest('[data-gr]');
    if(!el) return;
    aktiv=el; feuer(el);
  });
  document.addEventListener('focusout',function(e){
    var el=e.target&&e.target.closest&&e.target.closest('[data-gr]');
    if(!el) return;
    var to=e.relatedTarget;
    if(to&&to.closest&&to.closest('.gr-bar')) return;           // Fokus in die Leiste
    if(Date.now()-barHit<700) return;                            // Touch: relatedTarget ist leer
    feuer(el);
    if(aktiv===el){ aktiv=null; merk=null; barWeg(); }
  });
  document.addEventListener('selectionchange',function(){ if(aktiv) merkeSel(); });
  document.addEventListener('mousedown',function(e){
    var b=e.target&&e.target.closest&&e.target.closest('.gr-bar');
    if(!b) return;
    barHit=Date.now();
    if(e.target.closest('button')) e.preventDefault();           // Feld behält Fokus + Auswahl
  });
  document.addEventListener('touchstart',function(e){
    if(e.target&&e.target.closest&&e.target.closest('.gr-bar')) barHit=Date.now();
  },{passive:true});
  document.addEventListener('click',function(e){
    var b=e.target&&e.target.closest&&e.target.closest('[data-gr-cmd]');
    if(!b) return;
    e.preventDefault();
    cmd(b.getAttribute('data-gr-cmd'));
  });
  document.addEventListener('keydown',function(e){
    var el=e.target&&e.target.closest&&e.target.closest('[data-gr]');
    if(!el) return;
    if(e.key==='Escape'){ e.preventDefault(); el.blur(); return; }
    if((e.ctrlKey||e.metaKey)&&!e.altKey){
      var k=String(e.key||'').toLowerCase();
      if(k==='b'||k==='i'||k==='u'){
        e.preventDefault();
        aktiv=el;
        cmd(k==='b'?'bold':k==='i'?'italic':'underline');
        return;
      }
    }
    // Enter fügt IMMER ein sauberes <br> ein statt der Browser-Vorgabe
    // (<div>/<p>-Verschachtelung) — so steht der Umbruch im Editor genau
    // dort, wo er im Bericht erscheint. Zweimal Enter = Absatz.
    if(e.key==='Enter'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
      e.preventDefault();
      try{ document.execCommand('insertLineBreak'); }
      catch(_){ try{ document.execCommand('insertHTML',false,'<br>'); }catch(__){} }
      feuer(el);
    }
  });
  // Beim Scrollen/Grössenändern der Leiste folgen — sonst klebt sie an einer
  // alten Position über fremdem Inhalt.
  window.addEventListener('scroll',function(){ if(aktiv) barZeigen(aktiv); },{passive:true});
  window.addEventListener('resize',function(){ if(aktiv) barZeigen(aktiv); });

  /* ── Stile (einmalig injiziert, damit jede Seite nur das Script braucht) */
  var css=''
    +'.gr-wrap{position:relative}'
    +'.gr-ed{min-height:96px;padding:10px 12px;border:1.5px solid var(--brd,#e2e8f0);border-radius:10px;background:var(--sur,#fff);'
      +'font:inherit;font-size:14px;line-height:1.55;color:var(--ink,#0f172a);white-space:pre-wrap;overflow-wrap:anywhere;outline:none}'
    +'.gr-ed--klein{min-height:64px}'
    +'.gr-ed:focus{border-color:var(--accent,#0891b2);box-shadow:0 0 0 3px rgba(8,145,178,.12)}'
    +'.gr-ed:empty:before{content:attr(data-ph);color:#cbd5e1}'
    +'.gr-ed[data-gr-ro]{background:var(--bg2,#f8fafc);color:var(--mut,#64748b)}'
    +'.gr-bar{position:absolute;z-index:1300;display:none;align-items:center;gap:2px;padding:4px 6px;border-radius:10px;'
      +'background:#0f172a;box-shadow:0 6px 20px rgba(15,23,42,.28)}'
    +'.gr-bar.is-on{display:flex}'
    +'.gr-b{min-width:30px;height:28px;padding:0 7px;border:0;border-radius:7px;background:transparent;color:#fff;'
      +'font-size:13px;cursor:pointer;line-height:1;touch-action:manipulation}'
    +'.gr-b:hover{background:rgba(255,255,255,.16)}'
    +'.gr-b:active{background:rgba(255,255,255,.28)}'
    +'.gr-sep{width:1px;height:16px;background:rgba(255,255,255,.25);margin:0 3px}'
    +'.gr-hint{color:rgba(255,255,255,.6);font-size:10.5px;margin-left:4px;white-space:nowrap}'
    +'@media (max-width:640px){.gr-hint{display:none}}'
    +'@media print{.gr-bar{display:none!important}.gr-ed{border:0;padding:0;background:transparent}}';
  function injCss(){
    if(document.getElementById('_grCss')) return;
    var st=document.createElement('style'); st.id='_grCss'; st.textContent=css;
    (document.head||document.documentElement).appendChild(st);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',injCss);
  else injCss();

  window.GemaRichtext={
    sanitize:sanitize, toPlain:toPlain, fromPlain:fromPlain, istRich:istRich,
    editorHtml:editorHtml, onChange:onChange, setWert:setWert,
    /* Test-Hooks */
    _esc:esc, _safeStyle:safeStyle
  };
})();
