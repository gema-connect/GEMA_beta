/* ===================================================================
   GEMA — Kachel-Filter für die Übersichtsseiten (Hub-Seiten)
   ===================================================================
   Blendet Modul-Kacheln aus, auf die die eingeloggte Rolle keinen
   Zugriff hat — auch die «Bald»-Ausblicke.

   Bis 24.08.2026 filterte NUR index.html; sb_index, el_index,
   pm_ausschreibung und ab_index zeigten jeder Rolle alle Kacheln.
   Dieser Helfer zieht die dort etablierten Regeln zentral nach,
   damit sie nicht in vier Kopien auseinanderlaufen.

   ─── REGELN (Kanon aus index.html, Feedback 21.08.2026) ─────────────
   1. Modul-Bezug: `data-module` hat Vorrang, sonst wird der Dateiname
      aus dem href über GemaAuth.getFileMap() zum Modul-Key aufgelöst.
      Auf den Hub-Seiten braucht darum KEINE Kachel ein neues Attribut.
   2. «Bald»-Kacheln (kein href, kein data-module) sind OPT-IN: sie
      erscheinen nur mit `data-soon-fuer="<modulKey>"` (+ optional
      `data-soon-recht`, Default read) und nur, wenn die Person das
      Recht hat. Sonst weg — der Ausblick ist kein Freibrief.
   3. Kachel MIT href, aber ohne FILE_MAP-Treffer: fail-open sichtbar
      (Muster _wsModAllowed in sys_workspace) — eine Nicht-Modul-Seite
      soll nie stillschweigend verschwinden.
   4. role_admin sieht alles (Roadmap vollständig).
   5. Gratis-Konto (GemaAuth.isFreeUser): Fachmodule werden GESPERRT
      statt versteckt — Wert zeigen statt verstecken.
   6. Zähler, leere Kategorien samt Sprunglink und Hero-Zahlen werden
      nachgezogen; ein Zähler wird nur angefasst, wenn er dem Muster
      «N Module» entspricht (nie einen fremden Text überschreiben).

   ─── KRITISCH — warum `!important` statt nur style.display ─────────
   pm_ausschreibung und ab_index haben eine Suche, die bei leerem
   Suchfeld `c.style.display=''` auf ALLE .mod-card setzt. Ein per
   Permission verstecktes Element käme damit zurück. Die Sichtbarkeit
   hängt deshalb an einer injizierten Regel
   `[data-perm-hidden]{display:none!important}` — Inline-Styles ohne
   !important verlieren dagegen. Der Marker `data-perm-hidden` bleibt
   erhalten (index.html/der native Home-Screen lesen ihn ebenfalls).

   Suchen, die NICHT über das DOM laufen (sb_index/el_index haben ein
   eigenes ALL_MODULES-Array), müssen selbst filtern —
   `GemaKachelFilter.darfDatei('sb_osmose.html')` ist dafür da.
   =================================================================== */
(function(w,d){
'use strict';

var STYLE_ID='_gkfStyle';

function _css(){
  if(d.getElementById(STYLE_ID)) return;
  var s=d.createElement('style');
  s.id=STYLE_ID;
  s.textContent=
    '[data-perm-hidden]{display:none!important}'+
    '.gkf-locked{opacity:.5;cursor:not-allowed;pointer-events:none;position:relative;filter:grayscale(.6)}'+
    '.gkf-locked::after{content:"🔒";position:absolute;top:10px;right:10px;font-size:15px;opacity:.85}';
  (d.head||d.documentElement).appendChild(s);
}

/* Dateiname aus einem href: 'sb_osmose.html?x=1#y' -> 'sb_osmose' */
function _datei(href){
  if(!href) return '';
  var h=String(href).split('#')[0].split('?')[0];
  h=h.substring(h.lastIndexOf('/')+1);
  if(!h) return '';
  return h.replace(/\.html?$/i,'');
}

function _fileMap(){
  try{
    if(typeof GemaAuth!=='undefined' && typeof GemaAuth.getFileMap==='function') return GemaAuth.getFileMap()||{};
  }catch(e){}
  return {};
}

function _istAdmin(u){
  return !!(u && u.roleIds && u.roleIds.indexOf('role_admin')>=0);
}

/* Kategorie-Container finden: .cat-section (index/pm/ab) ODER das
   Eltern-Element einer .cat-hd (sb_index/el_index haben dort nur
   ein <div id="…"> ohne gemeinsame Klasse). */
function _gruppen(root){
  var out=[];
  function add(el){ if(el && out.indexOf(el)<0) out.push(el); }
  Array.prototype.forEach.call(root.querySelectorAll('.cat-section'), add);
  Array.prototype.forEach.call(root.querySelectorAll('.cat-hd'), function(h){
    if(h.closest && h.closest('.cat-section')) return; // schon erfasst
    add(h.parentElement);
  });
  return out;
}

function _verstecke(el){
  el.setAttribute('data-perm-hidden','1');
  el.style.display='none';
}

function _sperre(el){
  el.classList.add('disabled');
  el.classList.add('gkf-locked');
  el.setAttribute('data-perm-locked','1');
  el.removeAttribute('href');
  el.setAttribute('title','Mit einem GEMA-Vollzugang verfügbar');
}

function _sichtbar(el){
  return el.getAttribute('data-perm-hidden')!=='1';
}

/* ── Kern ─────────────────────────────────────────────────────────── */
function apply(opts){
  opts=opts||{};
  if(typeof GemaAuth==='undefined') return null;
  var user=null;
  try{ user=GemaAuth.getCurrentUser(); }catch(e){}
  if(!user) return null;

  var root=opts.root||d;
  var kachelSel=opts.kachel||'.mod-card, .mod';
  var fm=_fileMap();
  var admin=_istAdmin(user);
  var frei=false;
  try{ frei=(typeof GemaAuth.isFreeUser==='function') && GemaAuth.isFreeUser(user); }catch(e){}

  _css();

  var stat={echt:0,ausblick:0,versteckt:0,gesperrt:0,gruppen:0};
  var kacheln=root.querySelectorAll(kachelSel);

  Array.prototype.forEach.call(kacheln,function(card){
    var key=card.getAttribute('data-module')||'';
    var href=card.getAttribute('href')||'';
    var hatZiel=!!(key||href);

    if(!hatZiel){
      /* «Bald»-Ausblick — OPT-IN */
      stat.ausblick++;
      if(admin) return;
      var sk=card.getAttribute('data-soon-fuer');
      var sr=card.getAttribute('data-soon-recht')||'read';
      if(sk && GemaAuth.can(sr,sk)) return;
      _verstecke(card); stat.versteckt++;
      return;
    }

    stat.echt++;
    if(admin) return;

    if(!key){
      var datei=_datei(href);
      key=fm[datei]||'';
      if(!key) return;              // fail-open: unbekannte Seite bleibt
    }

    var recht=card.getAttribute('data-perm-recht')||'read';
    if(GemaAuth.can(recht,key)) return;

    if(frei){ _sperre(card); stat.gesperrt++; return; }
    _verstecke(card); stat.versteckt++;
  });

  /* ── Kategorie-Zähler, leere Kategorien, Sprunglinks ────────────── */
  var gruppen=_gruppen(root);
  gruppen.forEach(function(g){
    var echt=0, ausblick=0;
    Array.prototype.forEach.call(g.querySelectorAll(kachelSel),function(c){
      if(!_sichtbar(c)) return;
      if(c.getAttribute('data-module')||c.getAttribute('href')) echt++; else ausblick++;
    });

    if(echt===0 && ausblick===0){
      _verstecke(g);
      if(g.id){
        Array.prototype.forEach.call(root.querySelectorAll('a[href="#'+g.id+'"]'),function(a){ _verstecke(a); });
      }
      return;
    }
    stat.gruppen++;

    var z=g.querySelector('.cat-count, .cat-count-badge');
    /* Nur anfassen, was wirklich ein Modul-Zähler ist. */
    if(z && /^\s*\d+\s+Module?\s*$/.test(z.textContent||'')){
      z.textContent=echt+' Modul'+(echt===1?'':'e');
    }
  });

  /* ── Hero-Zahlen ────────────────────────────────────────────────── */
  var sichtbarEcht=0, sichtbarAusblick=0;
  Array.prototype.forEach.call(kacheln,function(c){
    if(!_sichtbar(c)) return;
    if(c.getAttribute('data-module')||c.getAttribute('href')) sichtbarEcht++; else sichtbarAusblick++;
  });

  Array.prototype.forEach.call(root.querySelectorAll('.hero-stat'),function(st){
    var num=st.querySelector('.hero-stat-num');
    if(!num) return;
    if(!/^\s*\d+\s*$/.test(num.textContent||'')) return;   // «∞» & Co. nie anfassen
    var txt=(st.textContent||'').toLowerCase();
    if(txt.indexOf('kategorie')>=0)        num.textContent=String(stat.gruppen);
    else if(txt.indexOf('aktiv')>=0)       num.textContent=String(sichtbarEcht);
    else if(txt.indexOf('entwicklung')>=0) num.textContent=String(sichtbarAusblick);
    else if(txt.indexOf('modul')>=0)       num.textContent=String(sichtbarEcht+sichtbarAusblick);
  });

  return {echt:sichtbarEcht,ausblick:sichtbarAusblick,gruppen:stat.gruppen,
          versteckt:stat.versteckt,gesperrt:stat.gesperrt};
}

/* Für Suchen, die NICHT über das DOM laufen (eigenes Modul-Array).
   Ein Eintrag ohne url ist ein «Bald»-Ausblick → nur für Admin. */
function darfDatei(href,recht){
  if(typeof GemaAuth==='undefined') return true;
  var u=null; try{ u=GemaAuth.getCurrentUser(); }catch(e){}
  if(!u) return true;
  if(_istAdmin(u)) return true;
  if(!href) return false;
  var key=_fileMap()[_datei(href)];
  if(!key) return true;                 // fail-open wie oben
  return !!GemaAuth.can(recht||'read',key);
}

function auto(opts){
  if(d.readyState==='loading'){
    d.addEventListener('DOMContentLoaded',function(){ try{ apply(opts); }catch(e){} });
  } else {
    try{ apply(opts); }catch(e){}
  }
}

w.GemaKachelFilter={apply:apply,auto:auto,darfDatei:darfDatei,_datei:_datei};

})(window,document);
