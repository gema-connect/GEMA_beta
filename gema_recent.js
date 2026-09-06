/*  gema_recent.js — Zuletzt besuchte Module (Quick-Links)
    Trackt die letzten 5 besuchten Seiten in localStorage.
    Injiziert ein Dropdown-Button in .g-nav-right / .g-nav-actions.
    Einbinden: <script src="gema_recent.js"></script> (nach gema_auth.js)
*/
(function(){
  var STORAGE='gema_recent_v1';
  var MAX=5;

  var PAGE_LABELS={
    // Vollständige Map aller Seiten (aus den <title>-Tags generiert) —
    // genutzt vom 🕒-Dropdown UND vom Mobile-Menü («Zuletzt verwendet»).
    'ab_berufsschule':'Berufsschule',
    'ab_index':'Lehrlingsausbildung',
    'ab_klassen':'Klassen & Lernmittel',
    'ab_pruefung_live':'Meine Prüfungen',
    'ab_pruefungen':'Prüfungen (Schule)',
    'ab_quiz':'Quiz & Lernkarten',
    'ab_sephir':'SEPHIR Bildungsbericht',
    'br_gasloeschung':'Gaslöschanlagen N2/Novec',
    'br_brandlast':'Brandlast Fluchtweg',
    'br_vkf_formular':'VKF-Formular',
    'br_vkf_formulare':'VKF-Formulare Sprinkler',
    'el_index':'Elektroberechnungen',
    'el_angaben':'Elektroangaben',
    'el_spannungsfall':'Spannungsfall & Verlustleistung',
    'el_belastbarkeit':'Strombelastbarkeit',
    'el_kurzschluss':'Kurzschluss & Abschaltung',
    'el_leistungsbedarf':'Anschlussleistung',
    'el_beleuchtung':'Beleuchtungsberechnung',
    'el_photovoltaik':'Photovoltaik',
    'el_potenzialausgleich':'Potenzialausgleich & Schutzleiter',
    'el_poe':'PoE — Leistung & RP-Kategorie',
    'hy_legionellen':'Hygienemanagement',
    'hy_spuelmanager':'Spülmanager',
    'hy_w12':'Selbstkontrolle W12',
    'hz_ausdehnungsgefaess':'Ausdehnungsgefäss HE301',
    'hz_heizlast':'Heizlast aus Verbrauch',
    'hz_heizungsleitungen':'Heizungsleitungen',
    'hz_waermegruppen':'Wärmegruppen SIA 384',
    'hz_waermepumpe':'Wärmepumpe / JAZ',
    'if_fahrzeug':'Fahrzeugmanagement',
    'if_trocknung':'Trocknungsgeräte',
    'if_wareneingang':'Wareneingang',
    'if_arbeitskleider':'Arbeitskleider',
    'if_werkzeug':'Werkzeugmanagement',
    'iv_immobilien':'Immobilienverwaltung',
    'index':'Modulübersicht',
    'lt_hx_diagramm':'h,x-Diagramm',
    'pm_abnahme':'Abnahme SIA 118',
    'pm_ausschreibung':'Ausschreibung & Kalkulation',
    'pm_ausschreibungsunterlagen':'Ausschreibungsunterlagen',
    'pm_baustelle':'Baustellencheckliste',
    'pm_besprechung':'Besprechungsprotokoll',
    'pm_bestellungen':'Bestellungen',
    'pm_revisionsunterlagen':'Revisionsunterlagen',
    'pm_behoerden_formulare':'Behörden & Formulare',
    'pm_plaene':'Pläne einlesen',
    'pm_planablage':'Plandialog',
    'pm_pruefliste':'Prüfliste',
    'pm_wirtschaftlichkeit':'Wirtschaftlichkeitsrechnung',
    'pm_machbarkeitsstudie':'Machbarkeitsstudie',
    'pm_zustandsanalyse':'Zustandsanalyse',
    'pm_lebensdauer':'Lebensdauer-Katalog',
    'pm_crbx':'CRBX Offertvergleich',
    'pm_einsatzplan':'Termine',
    'pm_erp':'Offerten · Aufträge · Rechnungen',
    'pm_goodel':'Goodel',
    'pm_honorar':'Planungshonorar SIA 108',
    'pm_kostenkontrolle':'Kostenkontrolle',
    'pm_objekte':'Objekte & Beteiligte',
    'pm_regierapport':'Regierapporte',
    'pm_schnellausschreibung':'Schnellausschreibung',
    'pm_stunden':'Stundenerfassung',
    'pm_terminplan':'Terminplanung',
    'sa_abwasserhebeanlage':'Abwasserhebeanlage',
    'sa_enthaertung':'Enthärtungsanlage',
    'sa_fettabscheider':'Fettabscheider EN 1825',
    'sa_frischwasserstation':'Frischwasserstation',
    'sa_oelabscheider':'Ölabscheider EN 858',
    'sa_osmose':'Umkehrosmoseanlage',
    'sa_schlammsammler':'Schlammsammler',
    'sa_solaranlage':'Thermische Solaranlage',
    'sb_apparateliste':'Apparateliste Sanitär',
    'sb_ausstosszeiten':'Ausstosszeiten',
    'sb_druckanstieg':'Druckanstieg Temperatur',
    'sb_saugpumpe':'Saugpumpe (Saughöhe)',
    'sb_mischkreuz':'Mischkreuz',
    'sb_druckdispositiv':'Druckdispositiv',
    'sb_druckerhoehung':'Druckerhöhungsanlage',
    'sb_druckverlust':'Druckverlust Wasser',
    'sb_druckverlust_erdgas':'Druckverlust Erdgas',
    'sb_druckverlust_medizinalgas':'Druckverlust Medizinalgase',
    'sb_du_zusammenstellung':'DU-Zusammenstellung',
    'sb_fluessiggas':'Flüssiggas LPG',
    'sb_grobauslegung':'Grobauslegung',
    'sb_grundleitungen':'Grundleitungen',
    'sb_kreisprofil':'Hydraulik Kreisprofil',
    'sb_index':'Sanitärberechnungen',
    'sb_laengenausdehnung':'Längenausdehnung',
    'sb_lu_tabelle':'LU-Tabelle & Spitzenvolumenstrom',
    'sb_niederschlag':'Niederschlagsanfall',
    'sb_regenwasserrechner':'Regenwasserrechner AWEL',
    'sb_regenwasser_luzern':'Regenwasser Luzern',
    'sb_vonroll':'Von-Roll Tabellen',
    'sb_warmwasser':'Warmwasser SIA 385',
    'sb_summenlinien':'Summenliniendiagramm',
    'sb_zirkulation':'Zirkulationsberechnung',
    'sd_schadensbericht':'Schadensberichte',
    'sp_dachbericht':'Dachinspektion',
    'sv_service':'Service & Wartung',
    'sys_abos':'Abos & Preise (Admin)',
    'sys_admin':'Benutzerverwaltung',
    'sys_beta':'Beta Prüfungen',
    'sys_garagist_dashboard':'Werkstatt-Dashboard',
    'sys_lieferant_dashboard':'Lieferanten-Dashboard',
    'sys_lieferanten':'Lieferanten-Verwaltung',
    'sys_preise':'Preise & Abos',
    'sys_produktkatalog':'Produktkatalog',
    'sys_profil':'Profil & Einstellungen',
    'sys_unternehmen':'Unternehmen verwalten',
    'sys_workspace':'Workspace',
    'sys_card':'GEMA Card',
    'sys_card_editor':'Meine GEMA Card',
    'sys_card_reports':'Hinweise zur Karte',
    'sys_kontakte':'Kontaktbuch'
  };

  var SKIP=['sys_login','sys_card'];

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

  // Public API — genutzt vom Mobile-Menue (gema_mobile_menu.js) fuer
  // die Sektion «Zuletzt verwendet»
  window.GemaRecent = {
    list: _load,
    label: function(k){ return PAGE_LABELS[k] || k; },
    currentKey: _key
  };

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',_inject);
  } else {
    _inject();
  }
})();
