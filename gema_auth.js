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
    {id:'role_planer',name:'Sanitärplaner',color:'#0891b2',permissions:(function(){var p=_allPerms(true,true,false);p['werkzeugmanagement']={read:true,write:false,admin:false};p['objekte']={read:true,write:true,admin:true};return p;})()},
    {id:'role_architekt',name:'Architekt / GP',color:'#7c3aed',permissions:_somePerms(['terminplan','besprechungsprotokoll','kostenkontrolle','objekte','abnahme_sia'],true,false,false)},
    {id:'role_unternehmer',name:'Unternehmer',color:'#d97706',permissions:_somePerms(['terminplan','abnahme_sia','werkzeugmanagement','baustellencheckliste','inspektion_wartung'],true,true,false)},
    {id:'role_lieferant',name:'Lieferant / Prüfer',color:'#16a34a',permissions:_somePerms(['werkzeugmanagement'],true,true,false)},
  ];

  // ── Default Org + User ─────────────────────────────────────────────
  var DEFAULT_ORGS = [{
    id:'org_default', name:'Mein Unternehmen', logo:null, kategorie:'sanitaerplaner',
    settings:{waehrung:'CHF',land:'CH'},
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

  var DEFAULT_USERS = [{
    id:'user_admin', username:'admin', name:'Administrator',
    password:_hash('gema2025'), roleIds:['role_admin'], orgId:'org_default',
    active:true, createdAt:new Date().toISOString(),
    profile:{email:'',telefon:'',sprache:'de',benachrichtigungen:true,standardObjekt:'',einheiten:'metrisch'}
  }];

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

  // ── Nav Badge ───────────────────────────────────────────────────────
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
    badge.style.cssText='display:flex;align-items:center;gap:6px;margin-left:auto;padding-right:12px;flex-shrink:0';

    badge.innerHTML=
      '<div style="text-align:right">'+
        '<div style="font-size:12px;font-weight:700;color:#111827;line-height:1.2">'+_esc(user.name||user.username)+'</div>'+
        '<div style="font-size:10px;font-weight:600;color:'+roleColor+'">'+_esc(roleNames)+'</div>'+
      '</div>';
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

    saveOrgs:function(o){try{localStorage.setItem(STORAGE_ORGS,JSON.stringify(o));return true;}catch(e){return false;}},
    saveOrgCats:function(c){try{localStorage.setItem(STORAGE_ORG_CATS,JSON.stringify(c));return true;}catch(e){return false;}},
    saveUsers:function(u){try{localStorage.setItem(STORAGE_USERS,JSON.stringify(u));return true;}catch(e){return false;}},
    saveRoles:function(r){try{localStorage.setItem(STORAGE_ROLES,JSON.stringify(r));return true;}catch(e){return false;}},

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
