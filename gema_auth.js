/**
 * gema_auth.js — GEMA Auth & Rollenverwaltung v2
 * Multi-Tenant: Unternehmen → Benutzer → Rollen → Berechtigungen
 * Profil-Einstellungen, Logo-Swap, zentrale Auth für alle Module.
 */
(function(w) {
  'use strict';

  var STORAGE_ORGS    = 'gema_orgs_v1';
  var STORAGE_USERS   = 'gema_users_v1';
  var STORAGE_ROLES   = 'gema_roles_v1';
  var STORAGE_SESSION = 'gema_session_v1';
  var STORAGE_ORG_CATS= 'gema_org_cats_v1';
  var SESSION_DAYS    = 30;

  // ── Modul-Definitionen ─────────────────────────────────────────────
  var MODULES = [
    {key:'druckverlust',            label:'Druckverlust',              cat:'Sanitärberechnungen'},
    {key:'druckdispositiv',         label:'Druckdispositiv',           cat:'Sanitärberechnungen'},
    {key:'lu_tabelle',              label:'LU-Tabelle',                cat:'Sanitärberechnungen'},
    {key:'ausstosszeiten',          label:'Ausstosszeiten',            cat:'Sanitärberechnungen'},
    {key:'du_zusammenstellung',     label:'DU-Zusammenstellung',       cat:'Sanitärberechnungen'},
    {key:'enthaertungsanlage',      label:'Enthärtungsanlage',         cat:'Sanitärberechnungen'},
    {key:'druckerhoehung',          label:'Druckerhöhung',             cat:'Sanitärberechnungen'},
    {key:'osmose',                  label:'Osmose',                    cat:'Sanitärberechnungen'},
    {key:'frischwasserstation',     label:'Frischwasserstation',       cat:'Sanitärberechnungen'},
    {key:'laengenausdehnung',       label:'Längenausdehnung',          cat:'Sanitärberechnungen'},
    {key:'thermische_solaranlage',  label:'Thermische Solaranlage',    cat:'Sanitärberechnungen'},
    {key:'warmwasser_sia385',       label:'Warmwasser SIA 385',        cat:'Sanitärberechnungen'},
    {key:'niederschlagsanfall',     label:'Niederschlagsanfall',       cat:'Sanitärberechnungen'},
    {key:'fettabscheider',          label:'Fettabscheider',            cat:'Sanitärberechnungen'},
    {key:'oelabscheider',           label:'Ölabscheider',              cat:'Sanitärberechnungen'},
    {key:'schlammsammler',          label:'Schlammsammler',            cat:'Sanitärberechnungen'},
    {key:'abwasserhebeanlage',      label:'Abwasserhebeanlage',        cat:'Sanitärberechnungen'},
    {key:'objekte',                 label:'Objekte & Beteiligte',      cat:'Projektmanagement'},
    {key:'terminplan',              label:'Terminplan',                cat:'Projektmanagement'},
    {key:'besprechungsprotokoll',   label:'Besprechungsprotokoll',     cat:'Projektmanagement'},
    {key:'kostenkontrolle',         label:'Kostenkontrolle',           cat:'Projektmanagement'},
    {key:'planungshonorar',         label:'Planungshonorar SIA 108',   cat:'Projektmanagement'},
    {key:'abnahme_sia',             label:'Abnahme SIA 118',           cat:'Projektmanagement'},
    {key:'baustellencheckliste',    label:'Baustellencheckliste',      cat:'Projektmanagement'},
    {key:'ausschreibungsunterlagen',label:'Ausschreibungsunterlagen',  cat:'Projektmanagement'},
    {key:'apparateliste',           label:'Apparateliste',             cat:'Projektmanagement'},
    {key:'inspektion_wartung',      label:'Inspektion & Wartung',      cat:'Projektmanagement'},
    {key:'elektroangaben',          label:'Elektroangaben',            cat:'Projektmanagement'},
    {key:'berufsschule',            label:'Berufsschule',              cat:'Sonstiges'},
    {key:'spuelmanager',            label:'Spülmanager',               cat:'Hygiene'},
    {key:'w12',                     label:'Selbstkontrolle W12',       cat:'Hygiene'},
    {key:'werkzeugmanagement',      label:'Werkzeugmanagement',        cat:'Sonstiges'},
    {key:'fahrzeugmanagement',      label:'Fahrzeugmanagement',        cat:'Sonstiges'},
    {key:'vkf_formulare',           label:'VKF-Formulare',             cat:'Brandschutz'},
    {key:'vkf_formular',            label:'VKF-Formular',              cat:'Brandschutz'},
  ];

  // ── Filename → Modul-Key ──────────────────────────────────────────
  var FILE_MAP = {
    'sb_druckverlust':'druckverlust','sb_druckdispositiv':'druckdispositiv',
    'sb_lu_tabelle':'lu_tabelle','sb_ausstosszeiten':'ausstosszeiten',
    'sb_du_zusammenstellung':'du_zusammenstellung','sa_enthaertung':'enthaertungsanlage',
    'sb_druckerhoehung':'druckerhoehung','sa_osmose':'osmose',
    'sa_frischwasserstation':'frischwasserstation','sb_laengenausdehnung':'laengenausdehnung',
    'sa_solaranlage':'thermische_solaranlage','sb_warmwasser':'warmwasser_sia385',
    'sb_niederschlag':'niederschlagsanfall','sa_fettabscheider':'fettabscheider',
    'sa_oelabscheider':'oelabscheider','sa_schlammsammler':'schlammsammler',
    'sa_abwasserhebeanlage':'abwasserhebeanlage','pm_objekte':'objekte',
    'pm_terminplan':'terminplan','pm_besprechung':'besprechungsprotokoll',
    'pm_kostenkontrolle':'kostenkontrolle','pm_honorar':'planungshonorar',
    'pm_abnahme':'abnahme_sia','pm_baustelle':'baustellencheckliste',
    'pm_ausschreibungsunterlagen':'ausschreibungsunterlagen','sb_apparateliste':'apparateliste',
    'hy_inspektion':'inspektion_wartung','el_angaben':'elektroangaben',
    'ab_berufsschule':'berufsschule','hy_spuelmanager':'spuelmanager','hy_w12':'w12',
    'if_werkzeug':'werkzeugmanagement','if_fahrzeug':'fahrzeugmanagement',
    'br_vkf_formulare':'vkf_formulare','br_vkf_formular':'vkf_formular',
    'sb_grobauslegung':'grobauslegung','sb_vonroll':'vonroll_tabellen',
    'pm_goodel':'kostenkontrolle','ab_sephir':'sephir','ab_quiz':'quiz',
  };

  // ── Hash ───────────────────────────────────────────────────────────
  function _hash(str) {
    var h=5381;for(var i=0;i<str.length;i++){h=((h<<5)+h)+str.charCodeAt(i);h=h&0xffffffff;}
    return 'gh_'+Math.abs(h).toString(16)+'_'+str.length;
  }

  // ── Default Permissions ────────────────────────────────────────────
  function _allPerms(r,wr,a){var p={};MODULES.forEach(function(m){p[m.key]={read:!!r,write:!!wr,admin:!!a};});return p;}
  function _somePerms(keys,r,wr,a){var p=_allPerms(false,false,false);keys.forEach(function(k){p[k]={read:!!r,write:!!wr,admin:!!a};});return p;}

  var DEFAULT_ROLES = [
    {id:'role_admin',name:'Administrator',color:'#1d4ed8',permissions:_allPerms(true,true,true)},
    {id:'role_planer',name:'Sanitärplaner',color:'#16a34a',gewerke:['sanitaer'],permissions:(function(){var p=_allPerms(true,true,false);p['werkzeugmanagement']={read:true,write:false,admin:false};p['objekte']={read:true,write:true,admin:true};return p;})()},
    {id:'role_hlkk_planer',name:'Heizungsplaner',color:'#dc2626',gewerke:['hlkk'],permissions:(function(){var p=_allPerms(true,true,false);p['werkzeugmanagement']={read:true,write:false,admin:false};p['objekte']={read:true,write:true,admin:true};return p;})()},
    {id:'role_lueftung_planer',name:'Lüftungsplaner',color:'#2563eb',gewerke:['lueftung'],permissions:(function(){var p=_allPerms(true,true,false);p['werkzeugmanagement']={read:true,write:false,admin:false};p['objekte']={read:true,write:true,admin:true};return p;})()},
    {id:'role_elektro_planer',name:'Elektroplaner',color:'#d97706',gewerke:['elektro'],permissions:(function(){var p=_allPerms(true,true,false);p['werkzeugmanagement']={read:true,write:false,admin:false};p['objekte']={read:true,write:true,admin:true};return p;})()},
    {id:'role_architekt',name:'Architekt / GP',color:'#7c3aed',permissions:_somePerms(['terminplan','besprechungsprotokoll','kostenkontrolle','objekte','abnahme_sia'],true,false,false)},
    {id:'role_unternehmer',name:'Unternehmer',color:'#d97706',permissions:_somePerms(['terminplan','abnahme_sia','werkzeugmanagement','baustellencheckliste','inspektion_wartung'],true,true,false)},
    {id:'role_lieferant',name:'Lieferant',color:'#16a34a',permissions:_somePerms(['ausschreibungsunterlagen','produktkatalog'],true,true,false)},
    {id:'role_pruefer',name:'Prüfer',color:'#0891b2',permissions:_somePerms(['werkzeugmanagement','fahrzeugmanagement'],true,true,false)},
  ];

  // ── Default Org + User ─────────────────────────────────────────────
  var DEFAULT_ORGS = [{
    id:'org_default', name:'Jäggi Vollmer GmbH', logo:null, kategorie:'sanitaerplaner',
    rechtsform:'GmbH',
    adresse:{strasse:'Rheinfelderstrasse 10',plz:'4058',ort:'Basel',kanton:'BS',land:'CH'},
    kontakt:{email:'info@jaeggivollmer.ch',telefon:'061 692 03 11',website:''},
    settings:{waehrung:'CHF',land:'CH',sichtbarkeit:'firma',abteilungenAktiv:false},
    abteilungen:[],
    lizenzen:{typ:'pool',maxUser:5,aktiveUser:2,aboStart:'2025-01-01',aboEnde:'2026-12-31',gewerke:['sanitaer']},
    admins:['user_admin'],
    active:true,
    createdAt:new Date().toISOString()
  }];

  var DEFAULT_ORG_CATS = [
    {id:'sanitaerplaner',     name:'Sanitärplaner',          icon:'💧'},
    {id:'sanitaerinstallateur',name:'Sanitärinstallateur',   icon:'🔧'},
    {id:'heizungsplaner',     name:'Heizungsplaner',         icon:'🔥'},
    {id:'heizungsinstallateur',name:'Heizungsinstallateur',  icon:'♨️'},
    {id:'lueftungsplaner',    name:'Lüftungsplaner',         icon:'🌀'},
    {id:'elektroplaner',      name:'Elektroplaner',          icon:'⚡'},
    {id:'architekt',          name:'Architekt / Generalplaner', icon:'🏛'},
    {id:'bauherr',            name:'Bauherr / Investor',     icon:'🏗'},
    {id:'generalunternehmer', name:'Generalunternehmer',     icon:'👷'},
    {id:'lieferant',          name:'Lieferant / Hersteller', icon:'🏭'},
    {id:'brandschutz',        name:'Brandschutz / Sprinkler',icon:'🔥'},
    {id:'immobilien',         name:'Immobilienverwaltung',   icon:'🏢'},
    {id:'behoerde',           name:'Behörde / Fachstelle',   icon:'🏛'},
    {id:'sonstiges',          name:'Sonstiges',              icon:'📦'},
  ];

  var DEFAULT_USERS = [
    {id:'user_admin', username:'admin', name:'Administrator',
     password:_hash('gema2025'), roleIds:['role_admin'], orgId:'org_default',
     active:true, createdAt:new Date().toISOString(),
     profile:{email:'',telefon:'',sprache:'de',benachrichtigungen:true,standardObjekt:'',einheiten:'metrisch'}},
    // Demo-Lieferanten (Login-Light + verschiedene Abo-Stufen)
    {id:'user_lief_bwt', username:'keller@bwt.ch', name:'Hans Keller',
     password:_hash('bwt2025'), roleIds:['role_lieferant'], orgId:'org_default',
     active:true, createdAt:'2025-01-15T10:00:00Z',
     profile:{email:'keller@bwt.ch',telefon:'061 755 88 99',firma:'BWT',person:'Hans Keller',sprache:'de'},
     kontotyp:'vollzugang', abo:{typ:'premium'},
     einladung:{token:'inv_bwt',eingeladenVon:'admin',eingeladenAm:'2025-01-10T08:00:00Z',angenommenAm:'2025-01-15T10:00:00Z',passwortGesetzt:true}},
    {id:'user_lief_gruenbeck', username:'weber@gruenbeck.ch', name:'Martin Weber',
     password:_hash('gruen2025'), roleIds:['role_lieferant'], orgId:'org_default',
     active:true, createdAt:'2025-06-01T08:00:00Z',
     profile:{email:'weber@gruenbeck.ch',telefon:'044 820 33 44',firma:'Grünbeck',person:'Martin Weber',sprache:'de'},
     kontotyp:'vollzugang', abo:{typ:'basic'},
     einladung:{token:'inv_gruenbeck',eingeladenVon:'admin',eingeladenAm:'2025-05-20T08:00:00Z',angenommenAm:'2025-06-01T08:00:00Z',passwortGesetzt:true}},
    {id:'user_lief_judo', username:'meier@judo.ch', name:'Claudia Meier',
     password:_hash('judo2025'), roleIds:['role_lieferant'], orgId:'org_default',
     active:true, createdAt:'2026-03-01T09:00:00Z',
     profile:{email:'meier@judo.ch',telefon:'031 920 11 22',firma:'Judo',person:'Claudia Meier',sprache:'de'},
     kontotyp:'login_light', abo:{typ:'testphase',testphaseEnde:'2026-03-31'},
     einladung:{token:'inv_judo',eingeladenVon:'admin',eingeladenAm:'2026-02-25T08:00:00Z',angenommenAm:'2026-03-01T09:00:00Z',passwortGesetzt:true}},
    // Demo-Planer
    {id:'user_planer_1', username:'planer', name:'Felix Jäggi',
     password:_hash('planer2025'), roleIds:['role_planer'], orgId:'org_default',
     active:true, createdAt:'2025-01-01T08:00:00Z',
     profile:{email:'felix@jaeggivollmer.ch',telefon:'061 692 03 11',sprache:'de',benachrichtigungen:true,dynamischeBKP:true}}
  ];

  // ── Storage ────────────────────────────────────────────────────────
  function _getOrgs()    {try{var r=localStorage.getItem(STORAGE_ORGS);   return r?JSON.parse(r):null;}catch(e){return null;}}
  function _getOrgCats() {try{var r=localStorage.getItem(STORAGE_ORG_CATS);return r?JSON.parse(r):null;}catch(e){return null;}}
  function _getUsers()   {try{var r=localStorage.getItem(STORAGE_USERS);  return r?JSON.parse(r):null;}catch(e){return null;}}
  function _getRoles()   {try{var r=localStorage.getItem(STORAGE_ROLES);  return r?JSON.parse(r):null;}catch(e){return null;}}
  function _getSession() {
    try{
      var r=localStorage.getItem(STORAGE_SESSION);if(!r)return null;
      var s=JSON.parse(r);
      if(s.expires&&new Date(s.expires)<new Date()){localStorage.removeItem(STORAGE_SESSION);return null;}
      return s;
    }catch(e){return null;}
  }

  function _initDefaults() {
    if(!_getOrgs())    try{localStorage.setItem(STORAGE_ORGS,JSON.stringify(DEFAULT_ORGS));}catch(e){}
    if(!_getOrgCats()) try{localStorage.setItem(STORAGE_ORG_CATS,JSON.stringify(DEFAULT_ORG_CATS));}catch(e){}
    if(!_getUsers())   try{localStorage.setItem(STORAGE_USERS,JSON.stringify(DEFAULT_USERS));}catch(e){}
    if(!_getRoles())   try{localStorage.setItem(STORAGE_ROLES,JSON.stringify(DEFAULT_ROLES));}catch(e){}
  }

  // ── Permissions ────────────────────────────────────────────────────
  function _getPerms(user,roles,mkey){
    var p={read:false,write:false,admin:false};
    if(!user||!user.roleIds)return p;
    user.roleIds.forEach(function(rid){
      var role=roles.find(function(r){return r.id===rid;});
      if(!role||!role.permissions||!role.permissions[mkey])return;
      var rp=role.permissions[mkey];
      if(rp.read)p.read=true;if(rp.write)p.write=true;if(rp.admin)p.admin=true;
    });return p;
  }
  function _detectModuleKey(){var f=location.pathname.split('/').pop().replace('.html','').toLowerCase();return FILE_MAP[f]||f;}
  function _isAdmin(user){return user&&user.roleIds&&user.roleIds.indexOf('role_admin')>=0;}

  // ── UI: Permissions ────────────────────────────────────────────────
  function _applyUI(perms){
    if(!perms.write){
      document.querySelectorAll('.gema-write-only,button[onclick*="openAdd"],button[onclick*="openObjektModal"],button[onclick*="submitForm"],button[onclick*="addItem"],button[onclick*="addTask"],button[onclick*="addMilestone"],button[onclick*="saveTool"],button[onclick*="saveAdd"],button[id="btnSave"],button[id="btnAddTask"],button[id="btnAddMilestone"],button[onclick*="newProtocol"],button[id="btnAddContractor"]').forEach(function(el){if(!el.classList.contains('gema-read-ok'))el.style.display='none';});
    }
    if(!perms.admin){
      document.querySelectorAll('.gema-admin-only,button[onclick*="delete"],button[onclick*="Delete"],button[onclick*="deleteTool"],button[onclick*="deleteTask"],button.pl-del,.tc-act-del,button[id="btnSettings"],button[onclick*="resetBtn"]').forEach(function(el){if(!el.classList.contains('gema-read-ok'))el.style.display='none';});
    }
  }

  // ── Login-Light Einschränkungen ─────────────────────────────────
  function _applyLoginLight(user){
    if(!user||user.kontotyp!=='login_light')return;
    var aboTyp=user.abo?user.abo.typ:'light';
    var isTest=aboTyp==='testphase';
    var testExpired=isTest&&user.abo.testphaseEnde&&user.abo.testphaseEnde<new Date().toISOString().split('T')[0];
    if(isTest&&!testExpired)return; // Testphase aktiv → voller Zugang

    // Copy-Schutz: kein Textmarkieren auf geschützten Bereichen
    var css=document.createElement('style');
    css.textContent='.gema-protected{user-select:none!important;-webkit-user-select:none!important}.gema-blur{filter:blur(5px)!important;pointer-events:none!important;user-select:none!important}';
    document.head.appendChild(css);

    // Projektdaten + Planerdaten schützen
    setTimeout(function(){
      document.querySelectorAll('.project-bar,.pf,#metaProjekt,#metaBearbeiter').forEach(function(el){el.classList.add('gema-protected');});
      // Download-Buttons verstecken
      document.querySelectorAll('button[onclick*="PDF"],button[onclick*="export"],a[download]').forEach(function(el){
        el.style.display='none';
      });
    },500);

    // Upgrade-Banner anzeigen
    var banner=document.createElement('div');
    banner.style.cssText='position:fixed;bottom:0;left:0;right:0;background:linear-gradient(135deg,#1e3a5f,#0f172a);color:#fff;padding:14px 24px;font-size:13px;z-index:9998;display:flex;align-items:center;justify-content:center;gap:16px;font-family:system-ui';
    banner.innerHTML='<span>🔒 <strong>Login-Light</strong> — PDF-Download und Textkopiermöglichkeit mit Abo freigeschaltet</span>'
      +'<button onclick="location.href=\'sys_lieferant_dashboard.html\'" style="background:#f59e0b;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-weight:700;cursor:pointer;font-size:12px;white-space:nowrap">Abo wählen →</button>';
    document.body.appendChild(banner);
  }

  // ── Logo Swap ──────────────────────────────────────────────────────
  function _swapLogo(org) {
    if (!org || !org.logo) return;
    // Find GEMA logo SVG in nav and replace with org logo (full nav height)
    var nav = document.querySelector('.g-nav');
    var navH = nav ? nav.offsetHeight : 52;
    var imgH = navH - 8; // 4px padding top+bottom
    var marks = document.querySelectorAll('.g-nav-mark');
    marks.forEach(function(mark) {
      var svg = mark.querySelector('svg') || mark.querySelector('img');
      if (svg) {
        var img = document.createElement('img');
        img.src = org.logo;
        img.style.cssText = 'height:'+imgH+'px;width:auto;max-width:120px;object-fit:contain';
        img.alt = org.name || 'Logo';
        mark.style.cssText = 'width:auto;height:'+imgH+'px;display:flex;align-items:center';
        mark.innerHTML = '';
        mark.appendChild(img);
      }
    });
    // Swap or hide brand text based on org settings
    var brands = document.querySelectorAll('.g-nav-brand');
    if (org.settings && org.settings.hideName) {
      brands.forEach(function(b) { b.style.display = 'none'; });
    } else if (org.name && org.name !== 'Mein Unternehmen') {
      brands.forEach(function(b) { b.textContent = org.name; });
    }
  }

  // ── Nav Badge + Admin User-Switcher ─────────────────────────────
  function _injectBadge(user, roles, org) {
    if (document.getElementById('_gemaAuthBadge')) return;
    var roleNames = (user.roleIds||[]).map(function(rid){
      var r=roles.find(function(x){return x.id===rid;}); return r?r.name:'';
    }).filter(Boolean).join(', ');
    var roleColor='#6b7280';
    if(user.roleIds&&user.roleIds.length){
      var fr=roles.find(function(r){return r.id===user.roleIds[0];});
      if(fr) roleColor=fr.color;
    }
    var badge=document.createElement('div');
    badge.id='_gemaAuthBadge';
    badge.style.cssText='display:flex;align-items:center;gap:6px;margin-left:16px;padding-right:12px;flex-shrink:0;position:relative';

    var isAdmin=_isAdmin(user);
    var isImpersonating=false;
    try{isImpersonating=!!localStorage.getItem('_gemaAdminOrigin');}catch(e){}
    var showSwitcher=isAdmin||isImpersonating;
    badge.innerHTML=
      '<div style="text-align:right;cursor:'+(showSwitcher?'pointer':'default')+'" '+(showSwitcher?'onclick="document.getElementById(\'_gemaSwitcher\').style.display=document.getElementById(\'_gemaSwitcher\').style.display===\'none\'?\'block\':\'none\'"':'')+'>'+
        '<div style="font-size:12px;font-weight:700;color:#111827;line-height:1.2">'+_esc(user.name||user.username)+(showSwitcher?' <span style="font-size:9px;color:#9ca3af">▼</span>':'')+'</div>'+
        '<div style="font-size:10px;font-weight:600;color:'+roleColor+'">'+_esc(roleNames)+'</div>'+
      '</div>';

    // Admin User-Switcher Dropdown (auch bei Impersonation)
    if(showSwitcher){
      var allUsers=_getUsers()||[];
      var dd=document.createElement('div');
      dd.id='_gemaSwitcher';
      dd.style.cssText='display:none;position:absolute;top:calc(100% + 6px);right:0;min-width:280px;max-height:400px;overflow-y:auto;background:#fff;border:1.5px solid #c8cfdf;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.15);z-index:600;padding:6px 0';
      dd.innerHTML=(isImpersonating?'<div onclick="GemaAuth._stopImpersonating()" style="padding:10px 14px;cursor:pointer;background:#1d4ed8;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;gap:6px;border-bottom:1px solid #e2e7f0" onmouseover="this.style.background=\'#1e40af\'" onmouseout="this.style.background=\'#1d4ed8\'">← Zurück zu Admin</div>':'')+
        '<div style="padding:6px 14px;font-size:10px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px">Als Benutzer anmelden</div>'+
        allUsers.map(function(u){
          var uRoles=(u.roleIds||[]).map(function(rid){var r=roles.find(function(x){return x.id===rid;});return r?r.name:'';}).filter(Boolean).join(', ');
          var uColor=(roles.find(function(r){return u.roleIds&&u.roleIds.indexOf(r.id)>=0;})||{color:'#6b7280'}).color;
          var isCurrent=u.id===user.id;
          var lightBadge=u.kontotyp==='login_light'?' <span style="font-size:9px;padding:1px 5px;border-radius:4px;background:#fef3c7;color:#92400e;font-weight:700">Light</span>':'';
          return '<div onclick="GemaAuth._switchUser(\''+u.id+'\')" style="padding:8px 14px;cursor:pointer;display:flex;align-items:center;gap:8px;transition:.1s;'+(isCurrent?'background:#eff4ff;':'')+'font-size:12px" onmouseover="this.style.background=\'#f3f5fb\'" onmouseout="this.style.background=\''+(isCurrent?'#eff4ff':'')+'\'">'+
            '<div style="width:28px;height:28px;border-radius:50%;background:'+uColor+';color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0">'+_esc((u.name||u.username).split(' ').map(function(s){return s[0];}).join('').substring(0,2).toUpperCase())+'</div>'+
            '<div style="flex:1;min-width:0">'+
              '<div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+_esc(u.name||u.username)+(isCurrent?' ✓':'')+lightBadge+'</div>'+
              '<div style="font-size:10px;color:#9ca3af">'+_esc(uRoles)+'</div>'+
            '</div>'+
          '</div>';
        }).join('')+
        '<div style="border-top:1px solid #e2e7f0;padding:8px 14px;margin-top:4px"><a href="sys_admin.html" style="font-size:11px;font-weight:700;color:#2563eb;text-decoration:none">👥 Benutzerverwaltung →</a></div>';
      badge.appendChild(dd);

      // Close on outside click
      document.addEventListener('click',function(e){
        if(!badge.contains(e.target)){dd.style.display='none';}
      });
    }

    var inner=document.querySelector('.g-nav-inner');
    if(inner) inner.appendChild(badge);
  }

  function _esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function _unblock(){var s=document.getElementById('_gaBlock');if(s)s.remove();}
  function _redirectLogin(){_unblock();location.href='sys_login.html?r='+encodeURIComponent(location.href);}

  // ── Auto-fill Bearbeiter field ──────────────────────────────────────
  function _autoFillBearbeiter(user) {
    // Runs slightly delayed to let module-specific loadMeta() execute first
    setTimeout(function() {
      var el = document.getElementById('metaBearbeiter');
      if (!el) return;
      var userName = user.name || user.username || '';
      // Only auto-fill if empty (no prior save) or if it matches current user
      if (!el.value || !el.value.trim()) {
        el.value = userName;
        // Trigger input event so saveMeta picks it up
        el.dispatchEvent(new Event('input', {bubbles:true}));
      }
    }, 150);
  }

  // ── Enhance Objekt dropdown format ─────────────────────────────────
  var _objDropdownEnhanced = false;
  function _enhanceObjektDropdown() {
    setTimeout(function() {
      var sel = document.getElementById('metaObjektDropdown');
      if (!sel || typeof GemaObjekte === 'undefined') return;
      var objs = GemaObjekte.getAll();
      var activeId = GemaObjekte.getActiveId();
      var currentVal = sel.value;
      sel.innerHTML = '<option value="">\u2013 Objekt w\u00e4hlen \u2013</option>' +
        objs.map(function(o) {
          var parts = [o.name || '\u2013'];
          if (o.strasse) parts.push(o.strasse);
          if (o.plz || o.ort) parts.push([o.plz, o.ort].filter(Boolean).join(' '));
          var label = parts.join(' \u00b7 ');
          var selected = (currentVal && o.id === currentVal) || (!currentVal && o.id === activeId);
          return '<option value="' + o.id + '"' + (selected ? ' selected' : '') + '>' + label + '</option>';
        }).join('');
      if (!_objDropdownEnhanced) {
        _objDropdownEnhanced = true;
        window.addEventListener('gema-objekte-loaded', function() { _enhanceObjektDropdown(); });
      }
    }, 200);
  }

  // ── Page detection ─────────────────────────────────────────────────
  var thisFile=location.pathname.split('/').pop()||'';
  var thisFileLower=thisFile.toLowerCase().replace('.html','');
  function _isSkip(){return thisFileLower==='sys_login';}
  function _isLoginOnly(){return ['index','sb_index','pm_ausschreibung','ab_index','sys_admin','sys_profil','sys_preise','sys_beta',''].indexOf(thisFileLower)>=0;}

  // ── INIT ───────────────────────────────────────────────────────────
  _initDefaults();

  if(_isSkip()){
    // login — no auth, just expose API
  } else {
    // Block page
    try{
      var _bs=document.createElement('style');_bs.id='_gaBlock';
      _bs.textContent='body{visibility:hidden!important}';
      (document.head||document.documentElement).appendChild(_bs);
    }catch(e){}

    var session=_getSession();
    if(!session){
      _redirectLogin();
    } else {
      var users=_getUsers()||DEFAULT_USERS;
      var roles=_getRoles()||DEFAULT_ROLES;
      var orgs=_getOrgs()||DEFAULT_ORGS;
      var user=users.find(function(u){return u.id===session.userId&&u.active;});
      if(!user){localStorage.removeItem(STORAGE_SESSION);_redirectLogin();}
      else {
        var userOrg=orgs.find(function(o){return o.id===user.orgId;})||orgs[0]||null;

        if(_isLoginOnly()){
          _unblock();
          document.addEventListener('DOMContentLoaded',function(){
            _injectBadge(user,roles,userOrg);
            _swapLogo(userOrg);
          });
        } else {
          var mkey=_detectModuleKey();
          var perms=_getPerms(user,roles,mkey);
          if(!_isAdmin(user)&&!perms.read){
            _unblock();
            document.addEventListener('DOMContentLoaded',function(){
              document.body.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui"><div style="text-align:center"><div style="font-size:48px">🔒</div><h2 style="margin:16px 0 8px">Kein Zugriff</h2><p style="color:#6b7280">Sie haben keine Berechtigung für dieses Modul.</p><a href="index.html" style="display:inline-block;margin-top:16px;padding:10px 24px;background:#1d4ed8;color:#fff;border-radius:8px;text-decoration:none;font-weight:700">← Zurück zur Übersicht</a></div></div>';
            });
          } else {
            _unblock();
            document.addEventListener('DOMContentLoaded',function(){
              if(!_isAdmin(user)) _applyUI(perms);
              _applyLoginLight(user);
              // Org-Admin Button sichtbar machen
              if(w.GemaAuth.isOrgAdmin(user.id)){
                var oab=document.getElementById('navOrgAdmin');
                if(oab)oab.style.display='';
              }
              _injectBadge(user,roles,userOrg);
              _swapLogo(userOrg);
              _autoFillBearbeiter(user);
              _enhanceObjektDropdown();
            });
          }
        }
      }
    }
  }

  // ── Public API ─────────────────────────────────────────────────────
  w.GemaAuth={
    getModules:function(){return MODULES;},
    getOrgs:_getOrgs,
    getOrgCats:_getOrgCats,
    getUsers:_getUsers,
    getRoles:_getRoles,
    getSession:_getSession,
    hash:_hash,

    getCurrentUser:function(){
      var s=_getSession();if(!s)return null;
      var u=_getUsers()||[];return u.find(function(x){return x.id===s.userId;})||null;
    },
    getCurrentOrg:function(){
      var user=w.GemaAuth.getCurrentUser();if(!user)return null;
      var orgs=_getOrgs()||[];
      return orgs.find(function(o){return o.id===user.orgId;})||orgs[0]||null;
    },
    can:function(action,mkey){
      var user=w.GemaAuth.getCurrentUser();if(!user)return false;
      if(_isAdmin(user))return true;
      var roles=_getRoles()||[];
      return !!_getPerms(user,roles,mkey||_detectModuleKey())[action];
    },
    login:function(username,password,remember){
      var users=_getUsers()||DEFAULT_USERS;
      var h=_hash(password);
      var user=users.find(function(u){return u.username.toLowerCase()===username.toLowerCase()&&u.password===h&&u.active;});
      if(!user)return null;
      var exp=new Date();exp.setDate(exp.getDate()+(remember?SESSION_DAYS:1));
      var s={userId:user.id,expires:exp.toISOString()};
      try{localStorage.setItem(STORAGE_SESSION,JSON.stringify(s));}catch(e){}
      return user;
    },
    logout:function(){localStorage.removeItem(STORAGE_SESSION);location.href='sys_login.html';},

    // Admin-Impersonation: als anderer User anmelden, Admin-Zugang bleibt
    _switchUser:function(userId){
      var users=_getUsers()||[];
      var user=users.find(function(u){return u.id===userId;});
      if(!user)return;
      // Merke den originalen Admin-User
      var curSession=_getSession();
      var origAdmin=null;
      try{origAdmin=localStorage.getItem('_gemaAdminOrigin');}catch(e){}
      if(!origAdmin&&curSession){
        var curUser=users.find(function(u){return u.id===curSession.userId;});
        if(curUser&&_isAdmin(curUser)){
          try{localStorage.setItem('_gemaAdminOrigin',curUser.id);}catch(e){}
        }
      }
      var exp=new Date();exp.setDate(exp.getDate()+1);
      var s={userId:user.id,expires:exp.toISOString()};
      try{localStorage.setItem(STORAGE_SESSION,JSON.stringify(s));}catch(e){}
      location.reload();
    },
    _isImpersonating:function(){
      try{return !!localStorage.getItem('_gemaAdminOrigin');}catch(e){return false;}
    },
    _getAdminOriginId:function(){
      try{return localStorage.getItem('_gemaAdminOrigin');}catch(e){return null;}
    },
    _stopImpersonating:function(){
      var origId=w.GemaAuth._getAdminOriginId();
      if(!origId)return;
      try{localStorage.removeItem('_gemaAdminOrigin');}catch(e){}
      w.GemaAuth._switchUser(origId);
    },

    // Gewerke des aktuellen Users ermitteln (aus allen Rollen zusammengeführt)
    getGewerke:function(){
      var user=w.GemaAuth.getCurrentUser();if(!user)return['sanitaer'];
      if(_isAdmin(user))return['sanitaer','hlkk','lueftung','elektro'];
      var roles=_getRoles()||DEFAULT_ROLES;
      var gewerke=[];
      (user.roleIds||[]).forEach(function(rid){
        var role=roles.find(function(r){return r.id===rid;});
        if(role&&role.gewerke)role.gewerke.forEach(function(g){if(gewerke.indexOf(g)<0)gewerke.push(g);});
      });
      return gewerke.length?gewerke:['sanitaer'];
    },

    saveOrgs:function(o){try{localStorage.setItem(STORAGE_ORGS,JSON.stringify(o));return true;}catch(e){return false;}},
    saveOrgCats:function(c){try{localStorage.setItem(STORAGE_ORG_CATS,JSON.stringify(c));return true;}catch(e){return false;}},
    saveUsers:function(u){try{localStorage.setItem(STORAGE_USERS,JSON.stringify(u));return true;}catch(e){return false;}},
    saveRoles:function(r){try{localStorage.setItem(STORAGE_ROLES,JSON.stringify(r));return true;}catch(e){return false;}},

    // ── Einladungssystem ──
    inviteLieferant:function(opts){
      // Erstellt einen Login-Light User für einen Lieferanten
      var users=_getUsers()||[];
      var token='inv_'+Date.now()+'_'+Math.random().toString(36).substring(2,8);
      var userId='user_lief_'+Date.now();
      var user={
        id:userId,
        username:opts.email||token,
        name:opts.firma||opts.person||'Lieferant',
        password:null, // Wird beim ersten Login gesetzt
        roleIds:['role_lieferant'],
        orgId:opts.orgId||'org_default',
        active:true,
        createdAt:new Date().toISOString(),
        profile:{
          email:opts.email||'',
          telefon:opts.tel||'',
          firma:opts.firma||'',
          person:opts.person||'',
          sprache:'de',
          benachrichtigungen:true
        },
        kontotyp:'login_light', // 'login_light' oder 'vollzugang'
        einladung:{
          token:token,
          eingeladenVon:opts.eingeladenVon||'',
          eingeladenAm:new Date().toISOString(),
          angenommenAm:null,
          passwortGesetzt:false
        },
        abo:{typ:'light',testphaseEnde:null}
      };
      users.push(user);
      w.GemaAuth.saveUsers(users);
      return{user:user,token:token,loginUrl:'sys_login.html?invite='+token};
    },

    // Token-basiertes Erstlogin
    activateInvitation:function(token,password){
      var users=_getUsers()||[];
      var user=users.find(function(u){return u.einladung&&u.einladung.token===token;});
      if(!user)return null;
      user.password=_hash(password);
      user.einladung.angenommenAm=new Date().toISOString();
      user.einladung.passwortGesetzt=true;
      // 30-Tage Testphase starten
      var testEnde=new Date();testEnde.setDate(testEnde.getDate()+30);
      user.abo={typ:'testphase',testphaseEnde:testEnde.toISOString().split('T')[0]};
      w.GemaAuth.saveUsers(users);
      return user;
    },

    // Prüfe ob User Login-Light ist
    isLoginLight:function(user){
      if(!user)user=w.GemaAuth.getCurrentUser();
      return user&&user.kontotyp==='login_light'&&(!user.abo||user.abo.typ==='light'||user.abo.typ==='testphase');
    },

    // Abo upgraden
    upgradeAbo:function(userId,aboTyp){
      var users=_getUsers()||[];
      var idx=users.findIndex(function(u){return u.id===userId;});
      if(idx<0)return false;
      users[idx].abo={typ:aboTyp};
      users[idx].kontotyp='vollzugang';
      return w.GemaAuth.saveUsers(users);
    },

    // ── Werkzeug-Mandate ──
    // Mandat = Beziehung zwischen Unternehmer-Firma und Lieferant/Prüfer
    // {id, unternehmerOrgId, unternehmerFirma, lieferantUserId, lieferantFirma,
    //  typ:'pruefer'|'lieferant'|'beides', zugang:'werkzeuge'|'kategorien'|'alle',
    //  kategorien:[], aktiv:true, erstelltAm, deaktiviertVon:null}
    getMandate:function(){
      try{var r=localStorage.getItem('gema_werkzeug_mandate');return r?JSON.parse(r):[];}catch(e){return[];}
    },
    saveMandate:function(mandate){
      try{localStorage.setItem('gema_werkzeug_mandate',JSON.stringify(mandate));}catch(e){}
    },
    createMandat:function(opts){
      var mandate=w.GemaAuth.getMandate();
      var m={
        id:'wm_'+Date.now(),
        unternehmerOrgId:opts.unternehmerOrgId||'',
        unternehmerFirma:opts.unternehmerFirma||'',
        lieferantUserId:opts.lieferantUserId||'',
        lieferantFirma:opts.lieferantFirma||'',
        typ:opts.typ||'pruefer',
        zugang:opts.zugang||'alle',
        kategorien:opts.kategorien||[],
        aktiv:true,
        erstelltAm:new Date().toISOString(),
        deaktiviertVon:null
      };
      mandate.push(m);
      w.GemaAuth.saveMandate(mandate);
      return m;
    },
    deaktivierMandat:function(mandatId,vonWem){
      var mandate=w.GemaAuth.getMandate();
      var m=mandate.find(function(x){return x.id===mandatId;});
      if(m){m.aktiv=false;m.deaktiviertVon=vonWem||'';w.GemaAuth.saveMandate(mandate);}
    },
    aktivierMandat:function(mandatId){
      var mandate=w.GemaAuth.getMandate();
      var m=mandate.find(function(x){return x.id===mandatId;});
      if(m){m.aktiv=true;m.deaktiviertVon=null;w.GemaAuth.saveMandate(mandate);}
    },
    getMeineMandate:function(userId,firma){
      // Mandate wo ich Lieferant/Prüfer bin
      return w.GemaAuth.getMandate().filter(function(m){
        return m.aktiv&&(m.lieferantUserId===userId||m.lieferantFirma===firma);
      });
    },
    getMandateFuerUnternehmer:function(orgId,firma){
      // Mandate die ein Unternehmer vergeben hat
      return w.GemaAuth.getMandate().filter(function(m){
        return m.unternehmerOrgId===orgId||m.unternehmerFirma===firma;
      });
    },

    // ── Unternehmens-Verwaltung ──
    isOrgAdmin:function(userId){
      var user=userId?(_getUsers()||[]).find(function(u){return u.id===userId;}):w.GemaAuth.getCurrentUser();
      if(!user)return false;
      if(_isAdmin(user))return true;
      var orgs=_getOrgs()||[];
      var org=orgs.find(function(o){return o.id===user.orgId;});
      return org&&org.admins&&org.admins.indexOf(user.id)>=0;
    },
    getOrgUsers:function(orgId){
      var users=_getUsers()||[];
      return users.filter(function(u){return u.orgId===orgId&&u.active;});
    },
    getOrgAbteilungen:function(orgId){
      var orgs=_getOrgs()||[];
      var org=orgs.find(function(o){return o.id===orgId;});
      return org?org.abteilungen||[]:[];
    },
    createAbteilung:function(orgId,name,farbe,gewerke){
      var orgs=_getOrgs()||[];
      var org=orgs.find(function(o){return o.id===orgId;});
      if(!org)return null;
      if(!org.abteilungen)org.abteilungen=[];
      var abt={id:'abt_'+Date.now(),name:name,farbe:farbe||'#6b7280',gewerke:gewerke||[],leiter:null};
      org.abteilungen.push(abt);
      w.GemaAuth.saveOrgs(orgs);
      return abt;
    },
    removeAbteilung:function(orgId,abtId){
      var orgs=_getOrgs()||[];
      var org=orgs.find(function(o){return o.id===orgId;});
      if(!org)return;
      org.abteilungen=(org.abteilungen||[]).filter(function(a){return a.id!==abtId;});
      // User in dieser Abteilung: abteilungId auf null setzen
      var users=_getUsers()||[];
      users.forEach(function(u){if(u.orgId===orgId&&u.abteilungId===abtId)u.abteilungId=null;});
      w.GemaAuth.saveOrgs(orgs);w.GemaAuth.saveUsers(users);
    },
    setUserAbteilung:function(userId,abtId){
      var users=_getUsers()||[];
      var idx=users.findIndex(function(u){return u.id===userId;});
      if(idx<0)return false;
      users[idx].abteilungId=abtId;
      return w.GemaAuth.saveUsers(users);
    },
    ernennOrgAdmin:function(orgId,userId){
      var orgs=_getOrgs()||[];
      var org=orgs.find(function(o){return o.id===orgId;});
      if(!org)return;
      if(!org.admins)org.admins=[];
      if(org.admins.indexOf(userId)<0)org.admins.push(userId);
      w.GemaAuth.saveOrgs(orgs);
    },
    entferneOrgAdmin:function(orgId,userId){
      var orgs=_getOrgs()||[];
      var org=orgs.find(function(o){return o.id===orgId;});
      if(!org)return;
      org.admins=(org.admins||[]).filter(function(id){return id!==userId;});
      w.GemaAuth.saveOrgs(orgs);
    },
    updateOrgSettings:function(orgId,settings){
      var orgs=_getOrgs()||[];
      var org=orgs.find(function(o){return o.id===orgId;});
      if(!org)return false;
      org.settings=Object.assign(org.settings||{},settings);
      return w.GemaAuth.saveOrgs(orgs);
    },
    updateOrgInfo:function(orgId,info){
      var orgs=_getOrgs()||[];
      var org=orgs.find(function(o){return o.id===orgId;});
      if(!org)return false;
      Object.keys(info).forEach(function(k){org[k]=info[k];});
      return w.GemaAuth.saveOrgs(orgs);
    },

    // ── Gastzugang ──
    requestGastZugang:function(userId,orgId){
      var users=_getUsers()||[];
      var user=users.find(function(u){return u.id===userId;});
      if(!user)return null;
      if(!user.gastZugaenge)user.gastZugaenge=[];
      var orgs=_getOrgs()||[];
      var org=orgs.find(function(o){return o.id===orgId;});
      var gast={orgId:orgId,orgName:org?org.name:'',status:'angefragt',gueltigBis:null,erstelltAm:new Date().toISOString(),bewilligtVon:null};
      user.gastZugaenge.push(gast);
      w.GemaAuth.saveUsers(users);
      return gast;
    },
    bewilligeGast:function(userId,orgId,gueltigBis,bewilligtVon){
      var users=_getUsers()||[];
      var user=users.find(function(u){return u.id===userId;});
      if(!user||!user.gastZugaenge)return;
      var g=user.gastZugaenge.find(function(x){return x.orgId===orgId;});
      if(g){g.status='aktiv';g.gueltigBis=gueltigBis||null;g.bewilligtVon=bewilligtVon||'';}
      w.GemaAuth.saveUsers(users);
    },
    deaktivierGast:function(userId,orgId){
      var users=_getUsers()||[];
      var user=users.find(function(u){return u.id===userId;});
      if(!user||!user.gastZugaenge)return;
      var g=user.gastZugaenge.find(function(x){return x.orgId===orgId;});
      if(g)g.status='deaktiviert';
      w.GemaAuth.saveUsers(users);
    },
    getGastOrgs:function(userId){
      // Alle Orgs wo dieser User aktiver Gast ist
      var users=_getUsers()||[];
      var user=users.find(function(u){return u.id===userId;});
      if(!user||!user.gastZugaenge)return[];
      var heute=new Date().toISOString().split('T')[0];
      return user.gastZugaenge.filter(function(g){
        return g.status==='aktiv'&&(!g.gueltigBis||g.gueltigBis>=heute);
      });
    },

    updateProfile:function(userId,profile){
      var users=_getUsers()||[];
      var idx=users.findIndex(function(u){return u.id===userId;});
      if(idx<0)return false;
      users[idx].profile=Object.assign(users[idx].profile||{},profile);
      return w.GemaAuth.saveUsers(users);
    },
    updateOrgLogo:function(orgId,base64){
      var orgs=_getOrgs()||[];
      var idx=orgs.findIndex(function(o){return o.id===orgId;});
      if(idx<0)return false;
      orgs[idx].logo=base64;
      return w.GemaAuth.saveOrgs(orgs);
    },

    defaultRoles:DEFAULT_ROLES,
    defaultModules:MODULES,
    isAdmin:function(){var u=w.GemaAuth.getCurrentUser();return _isAdmin(u);},
  };
})(window);
