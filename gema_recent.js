/*  gema_recent.js — Zuletzt besuchte Module (Quick-Links)
    Trackt die letzten 5 besuchten Seiten in localStorage.
    Injiziert ein Dropdown-Button in .g-nav-right / .g-nav-actions.
    Einbinden: <script src="gema_recent.js"></script> (nach gema_auth.js)
*/
(function(){
  var STORAGE='gema_recent_v1';
  var MAX=5;

  var PAGE_LABELS={
    'index':'Modulübersicht',
    'sb_index':'Sanitärberechnungen',
    'sb_druckverlust':'Druckverlust',
    'sb_druckdispositiv':'Druckdispositiv',
    'sb_druckerhoehung':'Druckerhöhung',
    'sb_lu_tabelle':'LU-Zusammenstellung',
    'sb_du_zusammenstellung':'DU-Zusammenstellung',
    'sb_ausstosszeiten':'Ausstosszeiten',
    'sb_laengenausdehnung':'Längenausdehnung',
    'sb_warmwasser':'Warmwasser SIA 385',
    'sb_niederschlag':'Niederschlagswasser',
    'sb_apparateliste':'Apparateliste',
    'sb_grobauslegung':'Grobauslegung',
    'sb_vonroll':'Von Roll Tabellen',
    'sa_enthaertung':'Enthärtungsanlage',
    'sa_osmose':'Osmoseanlage',
    'sa_frischwasserstation':'Frischwasserstation',
    'sa_fettabscheider':'Fettabscheider',
    'sa_oelabscheider':'Ölabscheider',
    'sa_schlammsammler':'Schlammsammler',
    'sa_abwasserhebeanlage':'Abwasserhebeanlage',
    'sa_solaranlage':'Thermische Solaranlage',
    'pm_objekte':'Projekte & Objekte',
    'pm_terminplan':'Terminplan',
    'pm_besprechung':'Sitzungsprotokoll',
    'pm_kostenkontrolle':'Kostenkontrolle',
    'pm_honorar':'Planungshonorar',
    'pm_abnahme':'Abnahme SIA',
    'pm_baustelle':'Baustellen-Checkliste',
    'pm_ausschreibung':'Ausschreibung',
    'pm_ausschreibungsunterlagen':'Ausschreibungsunterlagen',
    'pm_crbx':'CRBX Import',
    'pm_goodel':'Kostenkontrolle (GoOdel)',
    'pm_schnellausschreibung':'Schnellausschreibung',
    'hy_w12':'W12 Selbstkontrolle',
    'hy_inspektion':'Inspektion & Wartung',
    'hy_spuelmanager':'Spülmanager',
    'if_werkzeug':'Werkzeugmanagement',
    'if_fahrzeug':'Fahrzeugmanagement',
    'el_angaben':'Elektro-Angaben',
    'br_vkf_formulare':'VKF Formulare',
    'ab_index':'Ausbildung',
    'ab_berufsschule':'Berufsschule',
    'ab_quiz':'Quiz',
    'ab_sephir':'Sephir',
    'sys_lieferant_dashboard':'Lieferanten-Dashboard',
    'sys_produktkatalog':'Produktkatalog',
    'sys_admin':'Benutzerverwaltung',
    'sys_profil':'Profil & Einstellungen',
    'sys_preise':'Preise & Lizenzen',
    'sys_unternehmen':'Unternehmen'
  };

  var SKIP=['sys_login'];

  function _key(){
    return(location.pathname.split('/').pop()||'index').replace('.html','').toLowerCase();
  }

  function _load(){
    try{return JSON.parse(localStorage.getItem(STORAGE))||[];}catch(e){return[];}
  }
  function _save(list){
    try{localStorage.setItem(STORAGE,JSON.stringify(list));}catch(e){}
  }

  function _track(){
    var k=_key();
    if(SKIP.indexOf(k)>=0) return;
    var list=_load();
    list=list.filter(function(x){return x.key!==k;});
    list.unshift({key:k,ts:Date.now()});
    if(list.length>MAX) list=list.slice(0,MAX);
    _save(list);
  }

  function _inject(){
    var list=_load();
    var current=_key();
    var items=list.filter(function(x){return x.key!==current;});
    if(!items.length) return;

    var container=document.querySelector('.g-nav-right')||document.querySelector('.g-nav-actions');
    if(!container) return;

    var wrap=document.createElement('div');
    wrap.style.cssText='position:relative;display:inline-flex';
    wrap.className='no-print';

    var btn=document.createElement('button');
    btn.className='g-nav-btn';
    btn.title='Zuletzt besucht';
    btn.textContent='🕒';
    btn.style.cssText='font-size:16px;cursor:pointer';

    var dd=document.createElement('div');
    dd.style.cssText='display:none;position:absolute;top:100%;right:0;margin-top:6px;background:#fff;border:1px solid #e2e7f0;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12);min-width:220px;z-index:9999;overflow:hidden';

    var hdr=document.createElement('div');
    hdr.style.cssText='padding:10px 14px 6px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px';
    hdr.textContent='Zuletzt besucht';
    dd.appendChild(hdr);

    items.slice(0,MAX).forEach(function(item){
      var a=document.createElement('a');
      a.href=item.key+'.html';
      a.style.cssText='display:block;padding:8px 14px;font-size:13px;color:#1e293b;text-decoration:none;transition:background .15s';
      a.textContent=PAGE_LABELS[item.key]||item.key;
      a.onmouseenter=function(){a.style.background='#f0f3fa';};
      a.onmouseleave=function(){a.style.background='';};
      dd.appendChild(a);
    });

    wrap.appendChild(btn);
    wrap.appendChild(dd);

    container.insertBefore(wrap,container.firstChild);

    var open=false;
    btn.addEventListener('click',function(e){
      e.stopPropagation();
      open=!open;
      dd.style.display=open?'block':'none';
    });
    document.addEventListener('click',function(){
      open=false;dd.style.display='none';
    });
  }

  _track();
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',_inject);
  } else {
    _inject();
  }
})();
