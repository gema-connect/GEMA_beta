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
 * Nutzung im Berechnungs-Modul:
 *   <script src="gema_offer_request.js"></script>
 *   <button onclick="GemaOfferRequest.open({
 *     kategorie: 'enthaertung',
 *     titel: 'Enthaertungsanlage',
 *     berechnungswerte: { durchfluss: ..., kapazitaet: ..., ... },
 *     projekt: { name, ort, objektId },
 *     produktName: 'optional — z.B. Modell-Vorgabe',
 *     onSuccess: function(oa){ ... }
 *   })">📨 Externe Offerte</button>
 */
(function(w){
  'use strict';

  var OVERLAY_ID = 'gemaOfferReqOverlay';
  var _state = { firma:'', katalogId:'', orgId:'' };

  function E(s){
    return String(s==null?'':s).replace(/[&<>"']/g,function(m){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]);
    });
  }

  function _toast(msg, color){
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:'+(color||'#0f172a')+';color:#fff;padding:12px 24px;border-radius:10px;font-size:13px;font-weight:700;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,.25);font-family:"DM Sans",system-ui,sans-serif';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function(){ t.remove(); }, 3500);
  }

  // ── Autocomplete: sucht in Katalog-Lieferanten + Orgs ──
  function _suggest(q){
    var sugEl = document.getElementById('_gorSug');
    if(!sugEl) return;
    if(!q || q.length < 2){ sugEl.style.display='none'; return; }
    var ql = q.toLowerCase();
    var html = '';
    var found = 0;
    var shown = new Set();

    // 1. Katalog-Lieferanten
    try {
      if(typeof GemaProdukte !== 'undefined' && typeof GemaProdukte.searchLieferanten === 'function'){
        var katMatches = GemaProdukte.searchLieferanten(q).slice(0,5);
        katMatches.forEach(function(l){
          found++;
          if(l.firma) shown.add(l.firma.toLowerCase().trim());
          html += '<div class="_gorSugItem" data-kind="katalog" data-id="'+E(l.id)+'" style="padding:9px 12px;cursor:pointer;border-bottom:1px solid #e2e7f0;font-size:12px;display:flex;align-items:center;gap:8px;transition:.1s">'
            + '<div style="flex:1;min-width:0"><strong>'+E(l.firma)+'</strong><div style="font-size:11px;color:#6b7280">'+E(l.kontaktPerson||'')+(l.email?' · '+E(l.email):'')+'</div></div>'
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
      document.getElementById('_gorFirma').value   = l.firma || '';
      document.getElementById('_gorPerson').value  = l.kontaktPerson || '';
      document.getElementById('_gorEmail').value   = l.email || '';
      document.getElementById('_gorTel').value     = l.telefon || '';
      _state.katalogId = l.id;
      _state.orgId     = l.orgId || '';
    } else if(kind === 'org'){
      if(typeof GemaAuth === 'undefined') return;
      var orgs = GemaAuth.getOrgs ? (GemaAuth.getOrgs() || []) : [];
      var o = orgs.find(function(x){ return x.id === id; });
      if(!o) return;
      document.getElementById('_gorFirma').value = o.name || '';
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
      document.getElementById('_gorPerson').value = person;
      document.getElementById('_gorEmail').value  = email;
      document.getElementById('_gorTel').value    = tel;
      _state.katalogId = '';
      _state.orgId     = o.id;
    }
    document.getElementById('_gorSug').style.display = 'none';
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
    _state = { firma:'', katalogId:'', orgId:'' };

    var titel = opts.titel || 'Anlage';
    var kategorie = opts.kategorie || 'allgemein';
    var werte = opts.berechnungswerte || {};
    var projekt = opts.projekt || {};
    var projektName = projekt.name || '';
    var ov = document.createElement('div');
    ov.id = OVERLAY_ID;
    ov.style.cssText = 'position:fixed;inset:0;z-index:9500;background:rgba(15,23,42,.55);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px;font-family:"DM Sans",system-ui,sans-serif';
    ov.innerHTML =
      '<div style="background:#fff;border-radius:16px;max-width:560px;width:100%;max-height:92vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.25)">'
    +   '<div style="padding:18px 22px;border-bottom:1.5px solid #e2e7f0;display:flex;align-items:center;gap:10px">'
    +     '<div style="flex:1"><div style="font-size:16px;font-weight:800;color:#111827">📨 Externe Offerte anfragen</div>'
    +       '<div style="font-size:12px;color:#6b7280;margin-top:2px">'+E(titel)+' · Offerte an externen Lieferanten senden</div></div>'
    +     '<button id="_gorClose" style="background:#f4f6fb;border:none;border-radius:8px;width:32px;height:32px;font-size:18px;cursor:pointer;color:#6b7280">✕</button>'
    +   '</div>'
    +   '<div style="padding:18px 22px;display:flex;flex-direction:column;gap:12px">'
    +     '<div style="background:#fef3c7;border:1.5px solid #fde68a;border-radius:10px;padding:10px 12px;font-size:12px;color:#92400e;line-height:1.5">'
    +       '<strong>💡 Tipp:</strong> Der Lieferant muss nicht im System sein. Tippe einfach die Firma ein — falls sie bereits erfasst ist, wird sie verknüpft, sonst wird sie beim Senden automatisch angelegt und eingeladen.'
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
    +     '<div><label style="font-size:12px;font-weight:700;color:#6b7280;display:block;margin-bottom:4px">E-Mail *</label>'
    +       '<input type="email" id="_gorEmail" placeholder="kontakt@firma.ch" style="width:100%;padding:9px 12px;border:1.5px solid #cdd4e4;border-radius:8px;font-size:13px;font-family:inherit;outline:none"/></div>'
    +     '<div style="display:grid;grid-template-columns:1fr 120px;gap:10px">'
    +       '<div><label style="font-size:12px;font-weight:700;color:#6b7280;display:block;margin-bottom:4px">Projekt / Bauvorhaben</label>'
    +         '<input type="text" id="_gorProjekt" value="'+E(projektName).replace(/"/g,'&quot;')+'" style="width:100%;padding:9px 12px;border:1.5px solid #cdd4e4;border-radius:8px;font-size:13px;font-family:inherit;outline:none"/></div>'
    +       '<div><label style="font-size:12px;font-weight:700;color:#6b7280;display:block;margin-bottom:4px">Frist (Tage)</label>'
    +         '<input type="number" id="_gorFrist" value="14" min="1" max="90" style="width:100%;padding:9px 12px;border:1.5px solid #cdd4e4;border-radius:8px;font-size:13px;font-family:inherit;outline:none"/></div>'
    +     '</div>'
    +     '<div><label style="font-size:12px;font-weight:700;color:#6b7280;display:block;margin-bottom:4px">Nachricht an den Lieferanten</label>'
    +       '<textarea id="_gorMsg" rows="3" placeholder="z.B. Bitte Offerte inkl. Montage, Liefertermin…" style="width:100%;padding:9px 12px;border:1.5px solid #cdd4e4;border-radius:8px;font-size:13px;font-family:inherit;outline:none;resize:vertical"></textarea></div>'
    +     '<div style="background:#f4f6fb;border-radius:10px;padding:12px 14px">'
    +       '<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;margin-bottom:6px">Berechnungswerte (werden mitgesendet)</div>'
    +       _fmtWerte(werte)
    +     '</div>'
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
    ov.querySelector('#_gorSend').addEventListener('click', function(){
      _submit(opts);
    });
  }

  function close(){
    var ov = document.getElementById(OVERLAY_ID);
    if(ov) ov.remove();
    document.body.classList.remove('modal-open');
  }

  // ── Submit ──
  function _submit(opts){
    var firma  = (document.getElementById('_gorFirma').value || '').trim();
    var email  = (document.getElementById('_gorEmail').value || '').trim();
    var person = (document.getElementById('_gorPerson').value || '').trim();
    var tel    = (document.getElementById('_gorTel').value || '').trim();
    var msg    = (document.getElementById('_gorMsg').value || '').trim();
    var frist  = parseInt(document.getElementById('_gorFrist').value, 10) || 14;
    var projektName = (document.getElementById('_gorProjekt').value || '').trim();

    if(!firma){ _toast('Bitte Firma angeben', '#dc2626'); return; }
    if(!email || email.indexOf('@') < 0){ _toast('Bitte gültige E-Mail angeben', '#dc2626'); return; }

    var katalogId = _state.katalogId || '';
    var orgId     = _state.orgId || '';

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
          produktName: opts.produktName || opts.titel || '',
          kategorie: opts.kategorie || 'allgemein',
          berechnungswerte: opts.berechnungswerte || {},
          projekt: {
            name: projektName || (opts.projekt && opts.projekt.name) || '',
            ort:  (opts.projekt && opts.projekt.ort) || '',
            objektId: (opts.projekt && opts.projekt.objektId) || ''
          },
          nachricht: msg,
          fristTage: frist
        });
      }
    } catch(e) { console.warn('[GemaOfferRequest] createOffertanfrage', e); }

    close();
    var extraInfo = '';
    if(inviteResult && !inviteResult.existingAccount){
      extraInfo = ' · Neuer Kontakt eingeladen';
    } else if(inviteResult && inviteResult.existingAccount){
      extraInfo = ' · Mit bestehendem Login verknüpft';
    }
    _toast('📨 Offertanfrage an ' + firma + ' gesendet' + (oa && oa.frist ? ' (Frist: ' + oa.frist + ')' : '') + extraInfo, '#f59e0b');
    if(typeof opts.onSuccess === 'function') try { opts.onSuccess(oa); } catch(e) {}
  }

  w.GemaOfferRequest = {
    open:  open,
    close: close
  };
})(window);
