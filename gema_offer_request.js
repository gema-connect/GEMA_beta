/**
 * gema_offer_request.js — Wiederverwendbare externe Offertanfrage
 *
 * Erlaubt es einem Berechnungs-Modul (sa_enthaertung, sa_osmose, ...),
 * eine Offertanfrage inkl. Berechnungswerten an einen beliebigen
 * Lieferanten zu senden — auch an einen, der noch nicht als Produkt
 * im System hinterlegt ist.
 *
 * Der Flow:
 *   1. Planer klickt auf den Button "Externe Offerte anfragen".
 *   2. Modal oeffnet sich mit Firma-Autocomplete (sucht in Katalog-
 *      Lieferanten + Organisationen).
 *   3. Planer tippt oder waehlt eine Firma, gibt Email/Person/Tel an,
 *      schreibt eine Nachricht und setzt eine Frist.
 *   4. Beim Senden:
 *      a. Wenn Firma in bestehenden Katalog-Lieferanten/Orgs gefunden:
 *         verknuepfen statt neu anlegen.
 *      b. Sonst: quickCreateLieferant() legt Katalog-Eintrag an,
 *         GemaAuth.inviteLieferant() legt User + Org an (via
 *         ensureOrgForFirma — siehe gema_auth.js).
 *      c. createOffertanfrage() haengt die Berechnungswerte an und
 *         schreibt die Anfrage ins Offertanfrage-Register.
 *      d. Der neu eingeladene Lieferant sieht die Anfrage beim Login
 *         und kann sie beantworten.
 *
 * Skizzen-Umsetzung 08/2026 (Ausschreibungs-Workflow) — ADDITIV:
 *   - MEHRERE Hersteller in EINEM Dialog: «＋ Weiterer Hersteller» legt den
 *     aktuell erfassten Empfaenger als Chip in eine Liste; beim Senden
 *     entsteht PRO Hersteller eine EIGENE Offertanfrage (ein OA-Record je
 *     Lieferant — die bestehenden Leser bleiben unveraendert).
 *   - DATEI-ANHAENGE (Plaene, Datenblaetter): Upload via GemaStorage
 *     (Pfad oa/<orgId>), im OA-Record nur {name,url,size}; kleiner
 *     Base64-Fallback (≤ 2.5 MB) wenn der Upload scheitert. Nichts wird
 *     still verworfen — fehlgeschlagene Anhaenge werden BENANNT.
 *   - BKP-POSITION als eigenes Feld (Vorbelegung aus opts.bkp bzw.
 *     GemaProdukte.OA_BKP_MAP[kategorie]).
 *   - ANFRAGE-VORLAGEN org-weit (org.settings.offertanfrage.vorlagen)
 *     fuer den Nachrichtentext; verwalten duerfen Org-Admins.
 *   - «✓ N× angefragt»-Badge + Ranking im Autocomplete: Lieferanten mit
 *     passender Kategorie zuerst, danach die von der eigenen Firma am
 *     haeufigsten angefragten.
 *   - opts.freierModus: freie Anfrage OHNE Berechnung (editierbarer
 *     Betreff, keine Berechnungswerte-Box) — fuer pm_objekte «＋ Offertanfrage».
 *
 * Nutzung im Berechnungs-Modul:
 *   <script src="gema_offer_request.js"></script>
 *   <button onclick="GemaOfferRequest.open({
 *     kategorie: 'enthaertung',
 *     titel: 'Enthaertungsanlage',
 *     berechnungswerte: { durchfluss: ..., kapazitaet: ..., ... },
 *     projekt: { name, ort, objektId },
 *     produktName: 'optional — z.B. Modell-Vorgabe',
 *     bkp: 'optional — z.B. 253.0',
 *     anhaenge: [optional — bereits hochgeladene {name,url,size}],
 *     freierModus: false,
 *     onSuccess: function(oa, alleOas){ ... }   // alleOas = Array (Mehrfach-Versand)
 *   })">📨 Externe Offerte</button>
 */
(function(w){
  'use strict';

  var OVERLAY_ID = 'gemaOfferReqOverlay';
  var _state = { firma:'', katalogId:'', orgId:'', empfaenger:[], files:[] };
  var _currentKategorie = '';
  var _angefragt = null;   // {byId:{}, byFirma:{}} — OAs der eigenen Firma
  var _sending = false;

  function E(s){
    return String(s==null?'':s).replace(/[&<>"']/g,function(m){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]);
    });
  }

  function _toast(msg, color){
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:'+(color||'#0f172a')+';color:#fff;padding:12px 24px;border-radius:10px;font-size:13px;font-weight:700;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,.25);font-family:"DM Sans",system-ui,sans-serif;max-width:min(560px,92vw)';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function(){ t.remove(); }, 4200);
  }

  function _el(id){ return document.getElementById(id); }
  function _val(id){ var e=_el(id); return e ? (e.value||'').trim() : ''; }

  // ── «bereits angefragt»: OAs der EIGENEN Firma / des eigenen Users zaehlen ──
  // Der OA-Pool ist org-uebergreifend — gezaehlt wird nur, was von hier aus
  // angefragt wurde (absenderId bzw. absenderFirma = eigene Org).
  function _buildAngefragt(){
    _angefragt = { byId:{}, byFirma:{} };
    try {
      if(typeof GemaProdukte === 'undefined' || typeof GemaProdukte.getOffertanfragen !== 'function') return;
      var uid = '', meineFirma = '';
      try {
        var u = (typeof GemaAuth !== 'undefined' && GemaAuth.getCurrentUser) ? GemaAuth.getCurrentUser() : null;
        uid = (u && u.id) || '';
        var o = (typeof GemaAuth !== 'undefined' && GemaAuth.getCurrentOrg) ? GemaAuth.getCurrentOrg() : null;
        meineFirma = (o && o.name) || '';
      } catch(e) {}
      (GemaProdukte.getOffertanfragen() || []).forEach(function(oa){
        var mine = (uid && oa.absenderId === uid) || (meineFirma && oa.absenderFirma === meineFirma);
        if(!mine) return;
        if(oa.lieferantId) _angefragt.byId[oa.lieferantId] = (_angefragt.byId[oa.lieferantId]||0) + 1;
        var fk = (oa.lieferantFirma||'').toLowerCase().trim();
        if(fk) _angefragt.byFirma[fk] = (_angefragt.byFirma[fk]||0) + 1;
      });
    } catch(e) {}
  }
  function _angefragtCount(id, firma){
    if(!_angefragt) return 0;
    var n = 0;
    if(id && _angefragt.byId[id]) n = _angefragt.byId[id];
    var fk = (firma||'').toLowerCase().trim();
    if(fk && _angefragt.byFirma[fk]) n = Math.max(n, _angefragt.byFirma[fk]);
    return n;
  }
  function _badgeAngefragt(n){
    if(!n) return '';
    return '<span style="font-size:9px;padding:2px 7px;border-radius:4px;background:#dcfce7;color:#166534;font-weight:700;white-space:nowrap">✓ '+n+'× angefragt</span>';
  }

  // ── Autocomplete: sucht in Katalog-Lieferanten + Orgs ──
  function _suggest(q){
    var sugEl = _el('_gorSug');
    if(!sugEl) return;
    if(!q || q.length < 2){ sugEl.style.display='none'; return; }
    var ql = q.toLowerCase();
    var html = '';
    var found = 0;
    var shown = new Set();

    // 1. Katalog-Lieferanten — Ranking: exakte Kategorie zuerst, dann die
    //    von der eigenen Firma am haeufigsten angefragten.
    try {
      if(typeof GemaProdukte !== 'undefined' && typeof GemaProdukte.searchLieferanten === 'function'){
        // Alias-tolerant vergleichen (Alt-IDs wie 'abwasserhebeanlage' /
        // 'solaranlage' in bestehenden Profilen).
        var _nk = GemaProdukte.normKatId || function(x){return x;};
        var _curKat = _nk(_currentKategorie);
        var katMatches = GemaProdukte.searchLieferanten(q).filter(function(l){
          if(!_currentKategorie||_currentKategorie==='allgemein')return true;
          if(!l.lieferantKategorien||!l.lieferantKategorien.length)return true;
          return l.lieferantKategorien.some(function(x){return _nk(x)===_curKat;});
        });
        katMatches.sort(function(a,b){
          var ka = (a.lieferantKategorien&&a.lieferantKategorien.some(function(x){return _nk(x)===_curKat;}))?1:0;
          var kb = (b.lieferantKategorien&&b.lieferantKategorien.some(function(x){return _nk(x)===_curKat;}))?1:0;
          if(kb!==ka) return kb-ka;
          var na = _angefragtCount(a.id, a.firma), nb = _angefragtCount(b.id, b.firma);
          if(nb!==na) return nb-na;
          return (a.firma||'').localeCompare(b.firma||'');
        });
        katMatches = katMatches.slice(0,5);
        katMatches.forEach(function(l){
          found++;
          if(l.firma) shown.add(l.firma.toLowerCase().trim());
          var nAng = _angefragtCount(l.id, l.firma);
          html += '<div class="_gorSugItem" data-kind="katalog" data-id="'+E(l.id)+'" style="padding:9px 12px;cursor:pointer;border-bottom:1px solid #e2e7f0;font-size:12px;display:flex;align-items:center;gap:8px;transition:.1s">'
            + '<div style="flex:1;min-width:0"><strong>'+E(l.firma)+'</strong><div style="font-size:11px;color:#6b7280">'+E(l.kontaktPerson||'')+(l.email?' · '+E(l.email):'')+'</div></div>'
            + _badgeAngefragt(nAng)
            + '<span style="font-size:9px;padding:2px 7px;border-radius:4px;background:#fef3c7;color:#92400e;font-weight:700">Katalog</span>'
            + '</div>';
        });
      }
    } catch(e) {}

    // 2. Organisationen (Kategorie lieferant)
    try {
      if(typeof GemaAuth !== 'undefined' && typeof GemaAuth.getOrgs === 'function'){
        var orgs = GemaAuth.getOrgs() || [];
        var orgMatches = orgs.filter(function(o){
          if(o.id === 'org_default') return false;
          // Multi-Kategorie-Check: Array 'kategorien' hat Vorrang, sonst
          // Fallback auf Legacy-Feld 'kategorie'.
          var orgCats = (o.kategorien && o.kategorien.length) ? o.kategorien : (o.kategorie ? [o.kategorie] : []);
          if(orgCats.indexOf('lieferant') < 0) return false;
          if(_currentKategorie&&_currentKategorie!=='allgemein'&&o.lieferantKategorien&&o.lieferantKategorien.length>0){
            var _nk2 = (typeof GemaProdukte!=='undefined'&&GemaProdukte.normKatId)||function(x){return x;};
            if(!o.lieferantKategorien.some(function(x){return _nk2(x)===_nk2(_currentKategorie);}))return false;
          }
          var nameMatch = (o.name||'').toLowerCase().indexOf(ql) >= 0;
          var ortMatch  = (o.adresse && o.adresse.ort || '').toLowerCase().indexOf(ql) >= 0;
          return nameMatch || ortMatch;
        }).filter(function(o){
          return !shown.has((o.name||'').toLowerCase().trim());
        }).slice(0,5);
        orgMatches.forEach(function(o){
          found++;
          shown.add((o.name||'').toLowerCase().trim());
          var ort = (o.adresse && o.adresse.ort) || '';
          var email = (o.kontakt && o.kontakt.email) || '';
          html += '<div class="_gorSugItem" data-kind="org" data-id="'+E(o.id)+'" style="padding:9px 12px;cursor:pointer;border-bottom:1px solid #e2e7f0;font-size:12px;display:flex;align-items:center;gap:8px;transition:.1s">'
            + '<div style="flex:1;min-width:0"><strong>'+E(o.name)+'</strong><div style="font-size:11px;color:#6b7280">'+E(ort)+(email?' · '+E(email):'')+'</div></div>'
            + _badgeAngefragt(_angefragtCount('', o.name))
            + '<span style="font-size:9px;padding:2px 7px;border-radius:4px;background:#dbeafe;color:#1e40af;font-weight:700">Firma</span>'
            + '</div>';
        });
      }
    } catch(e) {}

    if(!found){
      sugEl.style.display = 'block';
      sugEl.innerHTML = '<div style="padding:10px 12px;font-size:12px;color:#6b7280">Keine bestehende Firma gefunden — wird beim Senden neu angelegt.</div>';
      return;
    }
    sugEl.style.display = 'block';
    sugEl.innerHTML = html;
    // Delegation
    sugEl.querySelectorAll('._gorSugItem').forEach(function(item){
      item.addEventListener('mouseenter', function(){ item.style.background='#f8faff'; });
      item.addEventListener('mouseleave', function(){ item.style.background=''; });
      item.addEventListener('click', function(){
        var kind = item.getAttribute('data-kind');
        var id = item.getAttribute('data-id');
        _pickSuggestion(kind, id);
      });
    });
  }

  function _pickSuggestion(kind, id){
    if(kind === 'katalog'){
      if(typeof GemaProdukte === 'undefined') return;
      var l = GemaProdukte.getLieferant(id);
      if(!l) return;
      _el('_gorFirma').value   = l.firma || '';
      _el('_gorPerson').value  = l.kontaktPerson || '';
      _el('_gorEmail').value   = l.email || '';
      _el('_gorTel').value     = l.telefon || '';
      _state.katalogId = l.id;
      _state.orgId     = l.orgId || '';
    } else if(kind === 'org'){
      if(typeof GemaAuth === 'undefined') return;
      var orgs = GemaAuth.getOrgs ? (GemaAuth.getOrgs() || []) : [];
      var o = orgs.find(function(x){ return x.id === id; });
      if(!o) return;
      _el('_gorFirma').value = o.name || '';
      var person = '', email = (o.kontakt && o.kontakt.email) || '', tel = (o.kontakt && o.kontakt.telefon) || '';
      if(o.admins && o.admins.length){
        var users = GemaAuth.getUsers ? (GemaAuth.getUsers() || []) : [];
        var adminUser = users.find(function(u){ return u.id === o.admins[0]; });
        if(adminUser){
          person = adminUser.name || (adminUser.profile && adminUser.profile.person) || '';
          if(!email) email = (adminUser.profile && adminUser.profile.email) || adminUser.username || '';
          if(!tel)   tel   = (adminUser.profile && adminUser.profile.telefon) || '';
        }
      }
      _el('_gorPerson').value = person;
      _el('_gorEmail').value  = email;
      _el('_gorTel').value    = tel;
      _state.katalogId = '';
      _state.orgId     = o.id;
    }
    _el('_gorSug').style.display = 'none';
  }

  // ── Mehrfach-Empfaenger (Chips) ──
  function _renderEmpfaenger(){
    var wrap = _el('_gorEmpfWrap');
    var list = _el('_gorEmpfList');
    if(!wrap || !list) return;
    if(!_state.empfaenger.length){ wrap.style.display='none'; list.innerHTML=''; return; }
    wrap.style.display = 'block';
    var html = '';
    _state.empfaenger.forEach(function(t, i){
      html += '<span class="_gorChip" data-i="'+i+'" title="Zum Bearbeiten anklicken" style="display:inline-flex;align-items:center;gap:6px;background:#eef4ff;border:1.5px solid #bfd3f6;border-radius:999px;padding:5px 6px 5px 12px;font-size:12px;font-weight:700;color:#1e3a5f;cursor:pointer;max-width:100%">'
        + '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+E(t.firma)+'</span>'
        + '<span style="font-weight:400;color:#6b7280;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+E(t.email)+'</span>'
        + '<button class="_gorChipX" data-i="'+i+'" title="Entfernen" style="border:none;background:#dbe7fb;color:#1e3a5f;border-radius:999px;width:20px;height:20px;font-size:12px;cursor:pointer;line-height:1;flex:0 0 auto">✕</button>'
        + '</span>';
    });
    list.innerHTML = html;
    list.querySelectorAll('._gorChipX').forEach(function(b){
      b.addEventListener('click', function(ev){
        ev.stopPropagation();
        var i = parseInt(b.getAttribute('data-i'),10);
        _state.empfaenger.splice(i,1);
        _renderEmpfaenger();
      });
    });
    // Chip anklicken = zurueck in die Felder laden (Bearbeiten)
    list.querySelectorAll('._gorChip').forEach(function(c){
      c.addEventListener('click', function(){
        var i = parseInt(c.getAttribute('data-i'),10);
        var t = _state.empfaenger[i];
        if(!t) return;
        _state.empfaenger.splice(i,1);
        _el('_gorFirma').value  = t.firma||'';
        _el('_gorPerson').value = t.person||'';
        _el('_gorEmail').value  = t.email||'';
        _el('_gorTel').value    = t.tel||'';
        _state.katalogId = t.katalogId||'';
        _state.orgId     = t.orgId||'';
        _renderEmpfaenger();
        _el('_gorFirma').focus();
      });
    });
  }

  function _addCurrent(){
    var firma = _val('_gorFirma');
    var email = _val('_gorEmail');
    if(!firma){ _toast('Bitte Firma angeben', '#dc2626'); return false; }
    if(!email || email.indexOf('@') < 0){ _toast('Bitte gültige E-Mail für ' + firma + ' angeben', '#dc2626'); return false; }
    var k = firma.toLowerCase().trim();
    var dup = _state.empfaenger.some(function(t){ return t.firma.toLowerCase().trim() === k; });
    if(dup){ _toast(firma + ' ist bereits in der Liste', '#dc2626'); return false; }
    _state.empfaenger.push({
      firma: firma, person: _val('_gorPerson'), email: email, tel: _val('_gorTel'),
      katalogId: _state.katalogId || '', orgId: _state.orgId || ''
    });
    _el('_gorFirma').value=''; _el('_gorPerson').value=''; _el('_gorEmail').value=''; _el('_gorTel').value='';
    _state.katalogId=''; _state.orgId='';
    _renderEmpfaenger();
    var sug=_el('_gorSug'); if(sug) sug.style.display='none';
    _el('_gorFirma').focus();
    return true;
  }

  // Chips + aktuell erfasste Felder → Empfaenger-Liste fuer den Versand.
  function _collectTargets(){
    var list = _state.empfaenger.slice();
    var firma = _val('_gorFirma');
    var email = _val('_gorEmail');
    if(firma){
      if(!email || email.indexOf('@') < 0) return { error: 'Bitte gültige E-Mail für ' + firma + ' angeben' };
      list.push({ firma: firma, person: _val('_gorPerson'), email: email, tel: _val('_gorTel'),
                  katalogId: _state.katalogId || '', orgId: _state.orgId || '' });
    }
    if(!list.length) return { error: 'Bitte Firma angeben' };
    // Duplikate (gleiche Firma) zusammenfassen — zwei Anfragen an dieselbe
    // Firma in einem Versand sind kaum gewollt.
    var seen = {};
    list = list.filter(function(t){
      var k = t.firma.toLowerCase().trim();
      if(seen[k]) return false;
      seen[k] = true; return true;
    });
    return { list: list };
  }

  // ── Datei-Anhaenge ──
  function _fmtSize(b){
    if(!(b>0)) return '';
    if(b < 1024*1024) return Math.max(1, Math.round(b/1024)) + ' KB';
    return (Math.round(b/1024/1024*10)/10) + ' MB';
  }
  function _renderFiles(){
    var list = _el('_gorFileList');
    if(!list) return;
    if(!_state.files.length){ list.innerHTML=''; return; }
    var html = '';
    _state.files.forEach(function(f, i){
      html += '<div style="display:flex;align-items:center;gap:8px;background:#f4f6fb;border:1px solid #e2e7f0;border-radius:8px;padding:6px 10px;font-size:12px">'
        + '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📄 '+E(f.file.name)+'</span>'
        + '<span style="color:#6b7280;font-size:11px;flex:0 0 auto">'+_fmtSize(f.file.size)+'</span>'
        + '<button class="_gorFileX" data-i="'+i+'" style="border:none;background:#e2e7f0;border-radius:6px;width:22px;height:22px;font-size:12px;cursor:pointer;color:#374151;flex:0 0 auto">✕</button>'
        + '</div>';
    });
    list.innerHTML = html;
    list.querySelectorAll('._gorFileX').forEach(function(b){
      b.addEventListener('click', function(){
        _state.files.splice(parseInt(b.getAttribute('data-i'),10),1);
        _renderFiles();
      });
    });
  }

  // Laedt die gewaehlten Dateien EINMAL hoch (dieselben URLs gehen an alle
  // Empfaenger). Fallback Base64 ≤ 2.5 MB; alles andere wird BENANNT statt
  // still verworfen. cb(anhaenge, fehlgeschlagen[])
  function _uploadAnhaenge(opts, cb){
    var files = _state.files.slice();
    var out = Array.isArray(opts.anhaenge) ? opts.anhaenge.slice() : [];
    if(!files.length){ cb(out, []); return; }
    var btn = _el('_gorSend');
    var orgId = 'org_default';
    try {
      var u = (typeof GemaAuth !== 'undefined' && GemaAuth.getCurrentUser) ? GemaAuth.getCurrentUser() : null;
      if(u && u.orgId) orgId = u.orgId;
    } catch(e) {}
    var fehl = [];
    var i = 0;
    function next(){
      if(i >= files.length){ cb(out, fehl); return; }
      var f = files[i].file;
      i++;
      if(btn) btn.textContent = '⏳ Anhang ' + i + '/' + files.length + ' …';
      var p = (typeof GemaStorage !== 'undefined' && GemaStorage.uploadFile)
        ? GemaStorage.uploadFile(f, 'oa/' + orgId)
        : Promise.reject(new Error('GemaStorage nicht geladen'));
      p.then(function(r){
        out.push({ name: f.name, url: r.url, size: f.size });
        next();
      }).catch(function(){
        if(f.size <= 2.5*1024*1024){
          var rd = new FileReader();
          rd.onload = function(){ out.push({ name: f.name, dataUrl: rd.result, size: f.size }); next(); };
          rd.onerror = function(){ fehl.push(f.name); next(); };
          rd.readAsDataURL(f);
        } else {
          fehl.push(f.name);
          next();
        }
      });
    }
    next();
  }

  // ── Anfrage-Vorlagen (org-weit, org.settings.offertanfrage.vorlagen) ──
  function _vorlagen(){
    try {
      var o = (typeof GemaAuth !== 'undefined' && GemaAuth.getCurrentOrg) ? GemaAuth.getCurrentOrg() : null;
      var v = o && o.settings && o.settings.offertanfrage && o.settings.offertanfrage.vorlagen;
      return Array.isArray(v) ? v : [];
    } catch(e) { return []; }
  }
  function _kannVorlagen(){
    try {
      var u = GemaAuth.getCurrentUser && GemaAuth.getCurrentUser();
      if(!u) return false;
      if((u.roleIds||[]).indexOf('role_admin') >= 0) return true;
      if(typeof GemaAuth.isOrgAdmin === 'function') return !!GemaAuth.isOrgAdmin(u);
    } catch(e) {}
    return false;
  }
  function _vorlagenSave(list, cb){
    try {
      var o = GemaAuth.getCurrentOrg && GemaAuth.getCurrentOrg();
      if(!o){ _toast('Keine Firma zugeordnet — Vorlagen sind firmenweit', '#dc2626'); return; }
      var res = GemaAuth.updateOrgSettings(o.id, {
        offertanfrage: Object.assign({}, (o.settings && o.settings.offertanfrage) || {}, { vorlagen: list })
      });
      Promise.resolve(res).then(function(r){
        if(r && r.ok === false){
          _toast('Speichern abgelehnt — Vorlagen können nur Org-Admins verwalten', '#dc2626');
        } else if(cb) cb();
      }).catch(function(){ _toast('Vorlage konnte nicht gespeichert werden', '#dc2626'); });
    } catch(e) { _toast('Vorlage konnte nicht gespeichert werden', '#dc2626'); }
  }
  function _renderVorlSelect(){
    var sel = _el('_gorVorlSel');
    if(!sel) return;
    var vs = _vorlagen();
    var html = '<option value="">— Vorlage wählen —</option>';
    vs.forEach(function(v){ html += '<option value="'+E(v.id)+'">'+E(v.name)+'</option>'; });
    sel.innerHTML = html;
    sel.style.display = (vs.length || _kannVorlagen()) ? '' : 'none';
  }
  function _applyVorlage(id){
    if(!id) return;
    var v = _vorlagen().find(function(x){ return x.id === id; });
    if(!v) return;
    var ta = _el('_gorMsg');
    if(!ta) return;
    var setText = function(){ ta.value = v.text || ''; };
    if((ta.value||'').trim() && typeof GemaDialog !== 'undefined' && GemaDialog.confirm){
      GemaDialog.confirm({
        title: 'Vorlage einsetzen',
        message: 'Die bestehende Nachricht wird durch die Vorlage «' + v.name + '» ersetzt.',
        confirmLabel: 'Ersetzen'
      }).then(function(ok){ if(ok) setText(); else { var s=_el('_gorVorlSel'); if(s) s.value=''; } });
    } else {
      setText();
    }
  }
  function _saveVorlage(){
    var text = _val('_gorMsg');
    if(!text){ _toast('Bitte zuerst eine Nachricht schreiben', '#dc2626'); return; }
    var doSave = function(name){
      if(name == null) return;
      name = String(name).trim();
      if(!name) return;
      var vs = _vorlagen().slice();
      vs.push({ id: 'oav_' + Date.now(), name: name, text: text });
      _vorlagenSave(vs, function(){
        _renderVorlSelect();
        _toast('💾 Vorlage «' + name + '» gespeichert (firmenweit)');
      });
    };
    if(typeof GemaDialog !== 'undefined' && GemaDialog.prompt){
      GemaDialog.prompt({ title: 'Als Vorlage speichern', placeholder: 'Name der Vorlage', defaultValue: '' }).then(doSave);
    } else {
      doSave(w.prompt('Name der Vorlage:', ''));
    }
  }
  function _delVorlage(){
    var sel = _el('_gorVorlSel');
    var id = sel ? sel.value : '';
    if(!id){ _toast('Bitte zuerst eine Vorlage wählen', '#dc2626'); return; }
    var v = _vorlagen().find(function(x){ return x.id === id; });
    var doDel = function(ok){
      if(!ok) return;
      _vorlagenSave(_vorlagen().filter(function(x){ return x.id !== id; }), function(){
        _renderVorlSelect();
        _toast('Vorlage gelöscht');
      });
    };
    if(typeof GemaDialog !== 'undefined' && GemaDialog.confirm){
      GemaDialog.confirm({
        title: 'Vorlage löschen',
        message: 'Vorlage «' + ((v && v.name) || '') + '» firmenweit löschen?',
        confirmLabel: 'Löschen', danger: true
      }).then(doDel);
    } else {
      doDel(w.confirm('Vorlage löschen?'));
    }
  }

  // Formatiert ein Berechnungswerte-Objekt als lesbare Text-Liste.
  function _fmtWerte(w){
    if(!w || typeof w !== 'object') return '—';
    var LABELS = {
      durchfluss:'Durchfluss',
      kapazitaet:'Kapazität',
      druckverlust:'Druckverlust',
      anschluss:'Anschluss',
      haerte_roh:'Rohwasserhärte',
      haerte_ziel:'Ziel-Härte',
      permeat:'Permeat',
      konzentrat:'Konzentrat',
      leistung:'Leistung',
      foerderhoehe:'Förderhöhe',
      volumen:'Volumen',
      groesse:'Grösse'
    };
    var rows = '';
    Object.keys(w).forEach(function(k){
      if(w[k] == null || w[k] === '') return;
      var label = LABELS[k] || k;
      rows += '<div style="display:flex;gap:8px;font-size:11px"><span style="color:#6b7280;min-width:110px">'+E(label)+'</span><strong>'+E(String(w[k]))+'</strong></div>';
    });
    return rows || '<span style="color:#9ca3af">Keine Werte übergeben.</span>';
  }

  // ── Modal öffnen ──
  function open(opts){
    opts = opts || {};
    close();
    _state = { firma:'', katalogId:'', orgId:'', empfaenger:[], files:[] };
    _sending = false;

    var titel = opts.titel || 'Anlage';
    var kategorie = opts.kategorie || 'allgemein';
    _currentKategorie = kategorie;
    _buildAngefragt();
    var werte = opts.berechnungswerte || {};
    var hatWerte = werte && Object.keys(werte).some(function(k){ return werte[k] != null && werte[k] !== ''; });
    var projekt = opts.projekt || {};
    var projektName = projekt.name || '';
    var frei = !!opts.freierModus;
    // BKP-Vorbelegung: opts.bkp gewinnt, sonst die kanonische Kategorie-Map.
    var bkpVor = opts.bkp || '';
    if(!bkpVor){
      try {
        if(typeof GemaProdukte !== 'undefined' && GemaProdukte.OA_BKP_MAP) bkpVor = GemaProdukte.OA_BKP_MAP[kategorie] || '';
      } catch(e) {}
    }
    var kannVorl = _kannVorlagen();
    var ov = document.createElement('div');
    ov.id = OVERLAY_ID;
    ov.style.cssText = 'position:fixed;inset:0;z-index:9500;background:rgba(15,23,42,.55);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px;font-family:"DM Sans",system-ui,sans-serif';
    ov.innerHTML =
      '<div style="background:#fff;border-radius:16px;max-width:560px;width:100%;max-height:92vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.25)">'
    +   '<div style="padding:18px 22px;border-bottom:1.5px solid #e2e7f0;display:flex;align-items:center;gap:10px">'
    +     '<div style="flex:1"><div style="font-size:16px;font-weight:800;color:#111827">📨 Externe Offerte anfragen</div>'
    +       '<div style="font-size:12px;color:#6b7280;margin-top:2px">'+E(titel)+' · Offerte an externe Lieferanten senden</div></div>'
    +     '<button id="_gorClose" style="background:#f4f6fb;border:none;border-radius:8px;width:32px;height:32px;font-size:18px;cursor:pointer;color:#6b7280">✕</button>'
    +   '</div>'
    +   '<div style="padding:18px 22px;display:flex;flex-direction:column;gap:12px">'
    +     '<div style="background:#fef3c7;border:1.5px solid #fde68a;border-radius:10px;padding:10px 12px;font-size:12px;color:#92400e;line-height:1.5">'
    +       '<strong>💡 Tipp:</strong> Der Lieferant muss nicht im System sein. Tippe einfach die Firma ein — falls sie bereits erfasst ist, wird sie verknüpft, sonst wird sie beim Senden automatisch angelegt und eingeladen. Mit «＋ Weiterer Hersteller» fragst du mehrere Firmen gleichzeitig an — jede erhält eine eigene Anfrage.'
    +     '</div>'
    +     '<div id="_gorEmpfWrap" style="display:none">'
    +       '<label style="font-size:12px;font-weight:700;color:#6b7280;display:block;margin-bottom:4px">Empfänger — je eine eigene Anfrage</label>'
    +       '<div id="_gorEmpfList" style="display:flex;flex-wrap:wrap;gap:6px"></div>'
    +     '</div>'
    +     '<div style="position:relative">'
    +       '<label style="font-size:12px;font-weight:700;color:#6b7280;display:block;margin-bottom:4px">Firma / Lieferant *</label>'
    +       '<input type="text" id="_gorFirma" autocomplete="off" placeholder="z.B. BWT, Grünbeck, Judo…" style="width:100%;padding:9px 12px;border:1.5px solid #cdd4e4;border-radius:8px;font-size:13px;font-family:inherit;outline:none"/>'
    +       '<div id="_gorSug" style="display:none;position:absolute;top:100%;left:0;right:0;margin-top:2px;background:#fff;border:1.5px solid #cdd4e4;border-radius:8px;box-shadow:0 12px 32px rgba(0,0,0,.12);max-height:240px;overflow-y:auto;z-index:10"></div>'
    +     '</div>'
    +     '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    +       '<div><label style="font-size:12px;font-weight:700;color:#6b7280;display:block;margin-bottom:4px">Ansprechperson</label>'
    +         '<input type="text" id="_gorPerson" placeholder="Name" style="width:100%;padding:9px 12px;border:1.5px solid #cdd4e4;border-radius:8px;font-size:13px;font-family:inherit;outline:none"/></div>'
    +       '<div><label style="font-size:12px;font-weight:700;color:#6b7280;display:block;margin-bottom:4px">Telefon</label>'
    +         '<input type="text" id="_gorTel" placeholder="+41 …" style="width:100%;padding:9px 12px;border:1.5px solid #cdd4e4;border-radius:8px;font-size:13px;font-family:inherit;outline:none"/></div>'
    +     '</div>'
    +     '<div style="display:flex;gap:10px;align-items:flex-end">'
    +       '<div style="flex:1"><label style="font-size:12px;font-weight:700;color:#6b7280;display:block;margin-bottom:4px">E-Mail *</label>'
    +         '<input type="email" id="_gorEmail" placeholder="kontakt@firma.ch" style="width:100%;padding:9px 12px;border:1.5px solid #cdd4e4;border-radius:8px;font-size:13px;font-family:inherit;outline:none"/></div>'
    +       '<button id="_gorAdd" title="Diesen Hersteller zur Liste hinzufügen und einen weiteren erfassen" style="padding:9px 14px;border-radius:8px;border:1.5px dashed #b6c2da;background:#f8faff;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;color:#1e3a5f;white-space:nowrap">＋ Weiterer Hersteller</button>'
    +     '</div>'
    +     (frei
    ?     '<div><label style="font-size:12px;font-weight:700;color:#6b7280;display:block;margin-bottom:4px">Was wird angefragt (Betreff) *</label>'
    +       '<input type="text" id="_gorTitel" value="'+E(opts.produktName || '')+'" placeholder="z.B. Enthärtungsanlage, Sanitärapparate EG…" style="width:100%;padding:9px 12px;border:1.5px solid #cdd4e4;border-radius:8px;font-size:13px;font-family:inherit;outline:none"/></div>'
    :     '')
    +     '<div style="display:grid;grid-template-columns:1fr 110px 110px;gap:10px">'
    +       '<div><label style="font-size:12px;font-weight:700;color:#6b7280;display:block;margin-bottom:4px">Projekt / Bauvorhaben</label>'
    +         '<input type="text" id="_gorProjekt" value="'+E(projektName)+'" style="width:100%;padding:9px 12px;border:1.5px solid #cdd4e4;border-radius:8px;font-size:13px;font-family:inherit;outline:none"/></div>'
    +       '<div><label style="font-size:12px;font-weight:700;color:#6b7280;display:block;margin-bottom:4px">BKP-Position</label>'
    +         '<input type="text" id="_gorBkp" value="'+E(bkpVor)+'" placeholder="z.B. 253.0" style="width:100%;padding:9px 12px;border:1.5px solid #cdd4e4;border-radius:8px;font-size:13px;font-family:inherit;outline:none"/></div>'
    +       '<div><label style="font-size:12px;font-weight:700;color:#6b7280;display:block;margin-bottom:4px">Frist (Tage)</label>'
    +         '<input type="number" id="_gorFrist" value="14" min="1" max="90" style="width:100%;padding:9px 12px;border:1.5px solid #cdd4e4;border-radius:8px;font-size:13px;font-family:inherit;outline:none"/></div>'
    +     '</div>'
    +     '<div>'
    +       '<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px">'
    +         '<label style="font-size:12px;font-weight:700;color:#6b7280;flex:1">Nachricht an den Lieferanten</label>'
    +         '<select id="_gorVorlSel" style="padding:5px 8px;border:1.5px solid #cdd4e4;border-radius:8px;font-size:11.5px;font-family:inherit;max-width:170px;outline:none"></select>'
    +         (kannVorl
    ?         '<button id="_gorVorlSave" title="Aktuelle Nachricht als firmenweite Vorlage speichern" style="border:1.5px solid #cdd4e4;background:#fff;border-radius:8px;width:28px;height:28px;font-size:13px;cursor:pointer">💾</button>'
    +         '<button id="_gorVorlDel" title="Gewählte Vorlage löschen" style="border:1.5px solid #cdd4e4;background:#fff;border-radius:8px;width:28px;height:28px;font-size:13px;cursor:pointer">🗑</button>'
    :         '')
    +       '</div>'
    +       '<textarea id="_gorMsg" rows="3" placeholder="z.B. Bitte Offerte inkl. Montage, Liefertermin…" style="width:100%;padding:9px 12px;border:1.5px solid #cdd4e4;border-radius:8px;font-size:13px;font-family:inherit;outline:none;resize:vertical"></textarea>'
    +     '</div>'
    +     '<div>'
    +       '<label style="font-size:12px;font-weight:700;color:#6b7280;display:block;margin-bottom:4px">📎 Anhänge (Pläne, Datenblätter, Fotos …)</label>'
    +       '<div id="_gorFileList" style="display:flex;flex-direction:column;gap:6px;margin-bottom:6px"></div>'
    +       '<button id="_gorFileAdd" style="padding:8px 14px;border-radius:8px;border:1.5px dashed #b6c2da;background:#f8faff;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;color:#1e3a5f">📎 Datei hinzufügen</button>'
    +       '<input type="file" id="_gorFileInput" multiple style="display:none" accept=".pdf,.dwg,.dxf,.jpg,.jpeg,.png,.zip,.doc,.docx,.xls,.xlsx"/>'
    +     '</div>'
    +     (frei && !hatWerte ? '' :
          '<div style="background:#f4f6fb;border-radius:10px;padding:12px 14px">'
    +       '<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;margin-bottom:6px">Berechnungswerte (werden mitgesendet)</div>'
    +       _fmtWerte(werte)
    +     '</div>')
    +   '</div>'
    +   '<div style="padding:14px 22px;border-top:1.5px solid #e2e7f0;display:flex;gap:8px;justify-content:flex-end">'
    +     '<button id="_gorCancel" style="padding:9px 16px;border-radius:8px;border:1.5px solid #cdd4e4;background:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;color:#111827">Abbrechen</button>'
    +     '<button id="_gorSend"   style="padding:9px 18px;border-radius:8px;border:none;background:#f59e0b;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">📨 Anfrage senden</button>'
    +   '</div>'
    + '</div>';
    document.body.appendChild(ov);
    document.body.classList.add('modal-open');

    // Listeners
    ov.querySelector('#_gorClose').addEventListener('click', close);
    ov.querySelector('#_gorCancel').addEventListener('click', close);
    // Vorbelegung aus opts.vorbelegung: Nachricht + Frist aus einem
    // zuvor laufenden Katalog-Dialog uebernehmen, damit der User nichts
    // doppelt eingeben muss, wenn er mitten im Flow auf "anderen
    // Lieferanten" wechselt.
    if (opts.vorbelegung) {
      try {
        if (opts.vorbelegung.nachricht != null) ov.querySelector('#_gorMsg').value = opts.vorbelegung.nachricht;
        if (opts.vorbelegung.frist != null)     ov.querySelector('#_gorFrist').value = opts.vorbelegung.frist;
      } catch(e) {}
    }
    var firmaInput = ov.querySelector('#_gorFirma');
    firmaInput.addEventListener('input', function(){
      _state.katalogId = ''; _state.orgId = ''; // bei manueller Bearbeitung Auswahl zuruecksetzen
      _suggest(firmaInput.value);
    });
    firmaInput.focus();
    // Outside click closes suggestions
    document.addEventListener('click', function(ev){
      var sug = document.getElementById('_gorSug');
      if(!sug) return;
      if(ev.target === firmaInput || sug.contains(ev.target)) return;
      sug.style.display = 'none';
    });
    ov.querySelector('#_gorAdd').addEventListener('click', function(){ _addCurrent(); });
    ov.querySelector('#_gorFileAdd').addEventListener('click', function(){
      var inp = _el('_gorFileInput');
      if(inp) inp.click();
    });
    ov.querySelector('#_gorFileInput').addEventListener('change', function(ev){
      var fs = ev.target.files || [];
      for(var i=0;i<fs.length;i++) _state.files.push({ file: fs[i] });
      ev.target.value = '';
      _renderFiles();
    });
    _renderVorlSelect();
    var vorlSel = ov.querySelector('#_gorVorlSel');
    if(vorlSel) vorlSel.addEventListener('change', function(){ _applyVorlage(vorlSel.value); });
    var vorlSave = ov.querySelector('#_gorVorlSave');
    if(vorlSave) vorlSave.addEventListener('click', _saveVorlage);
    var vorlDel = ov.querySelector('#_gorVorlDel');
    if(vorlDel) vorlDel.addEventListener('click', _delVorlage);
    ov.querySelector('#_gorSend').addEventListener('click', function(){
      _submit(opts);
    });
  }

  function close(){
    var ov = document.getElementById(OVERLAY_ID);
    if(ov) ov.remove();
    document.body.classList.remove('modal-open');
  }

  // ── Submit: ein OA-Record PRO Empfaenger ──
  function _submitOne(t, opts, shared){
    var firma = t.firma, email = t.email, person = t.person, tel = t.tel;
    var katalogId = t.katalogId || '';
    var orgId     = t.orgId || '';

    // 1) Katalog-Lieferant: bestehend nutzen oder per quickCreate anlegen
    var katalogLief = null;
    try {
      if(typeof GemaProdukte !== 'undefined'){
        if(katalogId) katalogLief = GemaProdukte.getLieferant(katalogId);
        if(!katalogLief && typeof GemaProdukte.quickCreateLieferant === 'function'){
          katalogLief = GemaProdukte.quickCreateLieferant(firma, email);
          if(katalogLief && person && !katalogLief.kontaktPerson && typeof GemaProdukte.updateLieferant === 'function'){
            GemaProdukte.updateLieferant(katalogLief.id, { kontaktPerson: person, telefon: tel || katalogLief.telefon });
          }
        }
        if(katalogLief) katalogId = katalogLief.id;
      }
    } catch(e) { console.warn('[GemaOfferRequest] quickCreateLieferant', e); }

    // 2) Einladung anlegen / User + Org (via ensureOrgForFirma) —
    //    aber nur wenn die Email noch nicht als User existiert.
    var inviteResult = null;
    try {
      if(typeof GemaAuth !== 'undefined' && typeof GemaAuth.inviteLieferant === 'function'){
        var users = GemaAuth.getUsers ? (GemaAuth.getUsers() || []) : [];
        var existingUser = users.find(function(u){
          return (u.username && u.username.toLowerCase() === email.toLowerCase())
              || (u.profile && u.profile.email && u.profile.email.toLowerCase() === email.toLowerCase());
        });
        if(existingUser){
          inviteResult = { user: existingUser, existingAccount: true };
          if(!orgId) orgId = existingUser.orgId || '';
        } else {
          inviteResult = GemaAuth.inviteLieferant({
            firma: firma, person: person, email: email, tel: tel,
            orgId: orgId || null,
            lieferantId: katalogId || '',
            eingeladenVon: 'berechnung_' + (opts.kategorie || '')
          });
          if(inviteResult && inviteResult.user) orgId = inviteResult.user.orgId || orgId;
        }
      }
    } catch(e) { console.warn('[GemaOfferRequest] inviteLieferant', e); }

    // 3) Katalog-Lieferant mit orgId verknuepfen, falls noch nicht
    try {
      if(katalogLief && orgId && !katalogLief.orgId && typeof GemaProdukte.updateLieferant === 'function'){
        GemaProdukte.updateLieferant(katalogLief.id, { orgId: orgId });
      }
    } catch(e) {}

    // 4) Offertanfrage erstellen
    var oa = null;
    try {
      if(typeof GemaProdukte !== 'undefined' && typeof GemaProdukte.createOffertanfrage === 'function'){
        oa = GemaProdukte.createOffertanfrage({
          lieferantId: katalogId,
          lieferantFirma: firma,
          produktId: '',
          produktName: shared.produktName,
          kategorie: opts.kategorie || 'allgemein',
          berechnungswerte: opts.berechnungswerte || {},
          projekt: {
            name: shared.projektName || (opts.projekt && opts.projekt.name) || '',
            ort:  (opts.projekt && opts.projekt.ort) || '',
            objektId: (opts.projekt && opts.projekt.objektId) || ''
          },
          nachricht: shared.msg,
          fristTage: shared.frist,
          bkp: shared.bkp,
          anhaenge: shared.anhaenge
        });
      }
    } catch(e) { console.warn('[GemaOfferRequest] createOffertanfrage', e); }

    return { oa: oa, invite: inviteResult };
  }

  function _submit(opts){
    if(_sending) return;
    var collected = _collectTargets();
    if(collected.error){ _toast(collected.error, '#dc2626'); return; }
    var targets = collected.list;

    var msg    = _val('_gorMsg');
    var frist  = parseInt(_val('_gorFrist'), 10) || 14;
    var projektName = _val('_gorProjekt');
    var bkp    = _val('_gorBkp');
    var produktName = opts.produktName || opts.titel || '';
    if(opts.freierModus){
      var betreff = _val('_gorTitel');
      if(!betreff){ _toast('Bitte angeben, was angefragt wird (Betreff)', '#dc2626'); return; }
      produktName = betreff;
    }

    _sending = true;
    var btn = _el('_gorSend');
    if(btn){ btn.disabled = true; btn.style.opacity = '.6'; btn.textContent = '⏳ Senden …'; }

    _uploadAnhaenge(opts, function(anhaenge, fehl){
      var shared = { msg: msg, frist: frist, projektName: projektName, bkp: bkp, produktName: produktName, anhaenge: anhaenge };
      var oas = [];
      var neuEingeladen = 0, verknuepft = 0;
      targets.forEach(function(t){
        var r = _submitOne(t, opts, shared);
        if(r.oa) oas.push(r.oa);
        if(r.invite && !r.invite.existingAccount) neuEingeladen++;
        else if(r.invite && r.invite.existingAccount) verknuepft++;
      });

      close();
      _sending = false;

      // Fehlgeschlagene Anhaenge BENENNEN — nie still verwerfen.
      if(fehl.length){
        var warn = fehl.length + ' Anhang/Anhänge konnten nicht hochgeladen werden und fehlen in der Anfrage: ' + fehl.join(', ');
        if(typeof GemaDialog !== 'undefined' && GemaDialog.alert){
          GemaDialog.alert({ title: 'Anhänge nicht hochgeladen', message: warn });
        } else {
          _toast('⚠ ' + warn, '#dc2626');
        }
      }

      if(oas.length > 1){
        var firmen = oas.map(function(o){ return o.lieferantFirma; }).join(', ');
        _toast('📨 ' + oas.length + ' Offertanfragen gesendet: ' + firmen
          + (neuEingeladen ? ' · ' + neuEingeladen + ' neu eingeladen' : ''), '#f59e0b');
      } else {
        var extraInfo = '';
        if(neuEingeladen) extraInfo = ' · Neuer Kontakt eingeladen';
        else if(verknuepft) extraInfo = ' · Mit bestehendem Login verknüpft';
        var oa0 = oas[0] || null;
        _toast('📨 Offertanfrage an ' + (targets[0] && targets[0].firma) + ' gesendet'
          + (oa0 && oa0.frist ? ' (Frist: ' + oa0.frist + ')' : '') + extraInfo, '#f59e0b');
      }
      if(typeof opts.onSuccess === 'function') try { opts.onSuccess(oas[0] || null, oas); } catch(e) {}
    });
  }

  w.GemaOfferRequest = {
    open:  open,
    close: close,
    // Test-Hooks (Drift-Guard) — keine oeffentliche API.
    _hooks: {
      addCurrent: _addCurrent,
      collectTargets: _collectTargets,
      vorlagen: _vorlagen,
      angefragtCount: function(id, firma){ _buildAngefragt(); return _angefragtCount(id, firma); },
      state: function(){ return _state; }
    }
  };
})(window);
