/**
 * gema_anlagenwahl.js — Wiederverwendbarer Anlagen-Wahl-Block
 *
 * Rendert in einem Container-Element den vollen Produktkatalog-Flow
 * (Lieferanten-Pills + Typen-Grid + Detail-Modal + Offertanfrage-Dialog)
 * fuer eine bestimmte Kategorie. Das Modul ist so gebaut, dass jedes
 * Berechnungsmodul es mit minimaler Konfiguration nutzen kann:
 *
 *   GemaAnlagenwahl.init({
 *     container: '#anlagenWahl',            // DOM-Element oder Selector
 *     kategorie: 'fettabscheider',          // Produktkatalog-Kategorie
 *     titel: 'Fettabscheider',              // Anzeigename
 *     accent: '#16a34a',                    // Akzentfarbe (optional)
 *     getBerechnungswerte: function(){      // Pflicht: aktuelle Werte
 *       return { ns: 2.5, schlammraum: 600 };
 *     },
 *     getProjekt: function(){               // optional
 *       return { name: '...', ort: '', objektId: '...' };
 *     },
 *     formatKennwerte: function(d){         // optional: wie das Produkt
 *       return '...';                        // im Detail dargestellt wird
 *     },
 *     onAnlageUebernommen: function(p){     // optional Callback
 *     }
 *   });
 *
 * Wenn der Produktkatalog keine passenden Eintraege der Kategorie hat,
 * wird ein Empty-State mit einem Button "Offerte an externen Lieferanten
 * anfragen" angezeigt — so kann der Planer auch ohne vorhandene Produkte
 * direkt eine Anfrage senden. Sobald ein Lieferant ein Produkt erfasst,
 * erscheint es automatisch in der Liste.
 *
 * Abhaengigkeiten: GemaProdukte (gema_produktkatalog_api.js),
 * GemaOfferRequest (gema_offer_request.js).
 */
(function(w){
  'use strict';

  function E(s){
    return String(s==null?'':s).replace(/[&<>"']/g,function(m){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]);
    });
  }

  // Pro Container laufen wir einen eigenen State, damit mehrere
  // Instanzen nebeneinander existieren koennten (z.B. zwei Kategorien
  // in einem Modul). Der State ist ueber die Container-ID indiziert.
  var _instances = {};

  function init(config){
    if(typeof GemaProdukte === 'undefined'){
      console.warn('[GemaAnlagenwahl] GemaProdukte nicht geladen');
      return;
    }
    var container = typeof config.container === 'string'
      ? document.querySelector(config.container)
      : config.container;
    if(!container) {
      console.warn('[GemaAnlagenwahl] Container nicht gefunden', config.container);
      return;
    }
    var id = container.id || ('gaw_' + Math.random().toString(36).substring(2,8));
    if(!container.id) container.id = id;
    var state = {
      container: container,
      id: id,
      cfg: config,
      selLief: 'alle',
      selProd: null
    };
    _instances[id] = state;
    _renderCard(state);
  }

  // ── Haupt-Rendering ──
  function _renderCard(state){
    var cfg = state.cfg;
    var titel = cfg.titel || 'Anlage';
    var accent = cfg.accent || '#2563eb';
    state.container.innerHTML =
      '<div class="gaw-card" style="background:var(--surface,#fff);border:1.5px solid var(--border,#e5e7eb);border-radius:16px;overflow:hidden;margin-top:20px">'
    +   '<div class="gaw-hd" style="display:flex;align-items:center;gap:10px;padding:14px 20px;border-bottom:1px solid var(--border,#e5e7eb);background:var(--bg,#f4f6fb)">'
    +     '<h3 style="font-size:15px;font-weight:800;flex:1;margin:0">🔍 Passende '+E(titel)+' aus dem Katalog</h3>'
    +     '<span class="gaw-info" style="font-size:12px;color:var(--muted,#6b7280)"></span>'
    +   '</div>'
    +   '<div class="gaw-body" style="padding:16px 20px">'
    +     '<div class="gaw-liefpills" style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap"></div>'
    +     '<div class="gaw-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px"></div>'
    +     '<div class="gaw-empty" style="display:none;padding:28px 20px;text-align:center;color:var(--muted,#6b7280);background:var(--bg,#f4f6fb);border:1.5px dashed var(--border2,#cdd4e4);border-radius:12px"></div>'
    +   '</div>'
    + '</div>';
    _renderPills(state);
    _renderGrid(state);
  }

  function _renderPills(state){
    var cfg = state.cfg;
    var pills = state.container.querySelector('.gaw-liefpills');
    if(!pills) return;
    var liefs = [];
    try { liefs = GemaProdukte.getLieferanten(cfg.kategorie) || []; } catch(e) {}
    if(!liefs.length) { pills.style.display = 'none'; return; }
    pills.style.display = '';
    // Tier-aware Sortierung (P03): Favoriten > Stamm > Premium > Verifiziert > Rest
    try { if(GemaProdukte.sortWithStamm) liefs = GemaProdukte.sortWithStamm(liefs); } catch(e) {}
    var html = '<div class="gaw-pill'+ (state.selLief==='alle'?' active':'') +'" data-lief="alle" style="'+_pillStyle(state.selLief==='alle', cfg.accent)+'">Alle</div>';
    liefs.forEach(function(l){
      var isPrem = false;
      try { isPrem = GemaProdukte.isLieferantPremium && GemaProdukte.isLieferantPremium(l); }
      catch(e) { isPrem = l && l.premium && l.premium.aktiv; }
      html += '<div class="gaw-pill'+ (state.selLief===l.firma?' active':'') +'" data-lief="'+E(l.firma)+'" style="'+_pillStyle(state.selLief===l.firma, cfg.accent)+(isPrem?';border-color:#f59e0b;background:#fefce8;color:#92400e':'')+'">'+E(l.firma)+(isPrem?' <svg width="14" height="14" viewBox="0 0 24 24" fill="#2563eb" style="vertical-align:-2px;flex-shrink:0"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>':'')+'</div>';
    });
    pills.innerHTML = html;
    pills.querySelectorAll('.gaw-pill').forEach(function(el){
      el.addEventListener('click', function(){
        state.selLief = el.getAttribute('data-lief');
        _renderPills(state);
        _renderGrid(state);
      });
    });
  }
  function _pillStyle(active, accent){
    return 'padding:6px 14px;border-radius:20px;font-size:12px;border:1.5px solid '+(active?accent:'#e5e7eb')+';background:'+(active?'#eff6ff':'#fff')+';cursor:pointer;color:'+(active?accent:'#6b7280')+';transition:.15s;font-weight:600';
  }

  function _renderGrid(state){
    var cfg = state.cfg;
    var grid  = state.container.querySelector('.gaw-grid');
    var empty = state.container.querySelector('.gaw-empty');
    var info  = state.container.querySelector('.gaw-info');
    if(!grid) return;
    var typen = [];
    try { typen = GemaProdukte.getTypen(cfg.kategorie, state.selLief==='alle' ? null : (GemaProdukte.getLieferanten(cfg.kategorie)||[]).find(function(l){return l.firma===state.selLief;})?.id) || []; } catch(e) {}
    var werte = {};
    try { werte = (typeof cfg.getBerechnungswerte === 'function' && cfg.getBerechnungswerte()) || {}; } catch(e) {}
    if(info) info.textContent = '';
    if(!typen.length){
      grid.style.display = 'none';
      empty.style.display = '';
      empty.innerHTML =
        '<div style="font-size:32px;margin-bottom:8px">📦</div>'
      + '<div style="font-weight:800;margin-bottom:4px;color:var(--text,#111827)">Keine '+E(cfg.titel||'Anlagen')+' im Katalog</div>'
      + '<div style="font-size:12px;line-height:1.5;max-width:420px;margin:0 auto 14px">Sobald Lieferanten ihre Produkte im Katalog erfassen, erscheinen sie hier automatisch. Du kannst trotzdem eine Offerte an einen externen Lieferanten senden — mit den aktuellen Berechnungswerten.</div>'
      + '<button class="gaw-extern-btn" style="padding:9px 18px;border-radius:8px;border:none;background:#f59e0b;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">📨 Offerte anfragen</button>';
      empty.querySelector('.gaw-extern-btn').addEventListener('click', function(){
        _openExternalDialog(state, null);
      });
      return;
    }
    grid.style.display = '';
    empty.style.display = 'none';
    grid.innerHTML = typen.map(function(t){
      return '<div class="gaw-typ-card" data-serie="'+E(t.serie)+'" style="background:#fff;border:1.5px solid #e5e7eb;border-radius:12px;padding:14px;cursor:pointer;transition:.15s">'
        + '<div style="font-size:14px;font-weight:700;margin-bottom:4px;display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:'+cfg.accent+';flex-shrink:0"></span>'+E(t.serie)+'</div>'
        + '<div style="font-size:12px;color:#6b7280;margin-bottom:8px">'+E((t.bauweise||t.technologie||'')+(t.count?' · '+t.count+' Modelle':''))+'</div>'
        + '</div>';
    }).join('');
    grid.querySelectorAll('.gaw-typ-card').forEach(function(el){
      el.addEventListener('mouseenter', function(){ el.style.borderColor='#cdd4e4'; });
      el.addEventListener('mouseleave', function(){ el.style.borderColor='#e5e7eb'; });
      el.addEventListener('click', function(){
        _openSerieDetail(state, el.getAttribute('data-serie'));
      });
    });
  }

  // ── Serie-Detail (Modelle der gewaehlten Serie) ──
  function _openSerieDetail(state, serie){
    var cfg = state.cfg;
    var prods = [];
    try {
      prods = (GemaProdukte.getProdukte(cfg.kategorie) || []).filter(function(p){
        return (p.daten && p.daten.serie) === serie;
      });
    } catch(e) {}
    if(!prods.length) return;
    var overlay = _makeOverlay();
    var body = prods.map(function(p){
      var d = p.daten || {};
      var kennwerte = typeof cfg.formatKennwerte === 'function'
        ? cfg.formatKennwerte(d)
        : _defaultKennwerte(d);
      return '<div class="gaw-prod-card" data-prodid="'+E(p.id)+'" style="background:#fff;border:1.5px solid #e5e7eb;border-radius:10px;padding:12px 14px;cursor:pointer;transition:.15s;margin-bottom:10px;overflow:hidden">'
        + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:nowrap">'
        +   '<strong style="font-size:14px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+E(d.serie||'')+' '+E(d.modell||'')+'</strong>'
        +   '<span style="flex:1"></span>'
        +   (p.status==='verifiziert'?'<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:#eff6ff;color:#1d4ed8;font-weight:700;white-space:nowrap;flex-shrink:0">✓ Verifiziert</span>':'<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:#fef2f2;color:#dc2626;font-weight:700;white-space:nowrap;flex-shrink:0">⚠ Nicht verifiziert</span>')
        + '</div>'
        + '<div style="font-size:12px;color:#6b7280">'+E(kennwerte)+'</div>'
        + '<div style="font-size:11px;color:#9ca3af;margin-top:4px">'+E(p.lieferantFirma||'')+'</div>'
        + '</div>';
    }).join('');
    overlay.innerHTML =
      '<div style="background:#fff;border-radius:16px;max-width:540px;width:100%;max-height:92vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.25);font-family:\'DM Sans\',system-ui,sans-serif">'
    +   '<div style="padding:16px 20px;border-bottom:1.5px solid #e2e8f0;display:flex;align-items:center;gap:10px">'
    +     '<h3 style="flex:1;font-size:16px;margin:0;font-weight:800">'+E(serie)+' — Modelle</h3>'
    +     '<button class="gaw-close" style="background:#f4f6fb;border:none;border-radius:8px;width:30px;height:30px;font-size:16px;cursor:pointer;color:#6b7280">✕</button>'
    +   '</div>'
    +   '<div style="padding:16px 20px">'+body+'</div>'
    + '</div>';
    document.body.appendChild(overlay);
    overlay.querySelector('.gaw-close').addEventListener('click', function(){ _removeOverlay(overlay); });
    overlay.querySelectorAll('.gaw-prod-card').forEach(function(el){
      el.addEventListener('mouseenter', function(){ el.style.background='#f8faff'; });
      el.addEventListener('mouseleave', function(){ el.style.background='#fff'; });
      el.addEventListener('click', function(){
        var prodId = el.getAttribute('data-prodid');
        _removeOverlay(overlay);
        _openProduktDetail(state, prodId);
      });
    });
  }

  function _defaultKennwerte(d){
    // Standardisierte Darstellung der wichtigsten Felder. Der Aufrufer
    // kann mit cfg.formatKennwerte einen modul-spezifischen Formatter
    // uebergeben.
    var parts = [];
    if(d.nenndurchfluss)  parts.push(d.nenndurchfluss + ' l/min');
    if(d.ns)              parts.push('NS ' + d.ns + ' l/s');
    if(d.volumen)         parts.push(d.volumen + ' l');
    if(d.leistungNenn)    parts.push(d.leistungNenn + ' kW');
    if(d.foerdermenge)    parts.push(d.foerdermenge + ' l/s');
    if(d.foerderhoehe)    parts.push(d.foerderhoehe + ' m');
    if(d.volumenstromMax) parts.push('Q ' + d.volumenstromMax + ' l/s');
    if(d.druckMax)        parts.push('p ' + d.druckMax + ' bar');
    if(d.bruttoflaeche)   parts.push(d.bruttoflaeche + ' m²');
    return parts.join(' · ') || '—';
  }

  // ── Produkt-Detail (ein konkretes Modell) ──
  function _openProduktDetail(state, prodId){
    var cfg = state.cfg;
    var p = null;
    try { p = GemaProdukte.getProdukt(prodId); } catch(e) {}
    if(!p) return;
    state.selProd = p.id;
    var d = p.daten || {};
    var overlay = _makeOverlay();
    overlay.innerHTML =
      '<div style="background:#fff;border-radius:16px;max-width:560px;width:100%;max-height:92vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.25);font-family:\'DM Sans\',system-ui,sans-serif">'
    +   '<div style="padding:16px 20px;border-bottom:1.5px solid #e2e8f0;display:flex;align-items:center;gap:10px">'
    +     '<h3 style="flex:1;font-size:16px;margin:0;font-weight:800">'+E(p.lieferantFirma||'')+' '+E(d.serie||'')+' '+E(d.modell||'')+'</h3>'
    +     '<button class="gaw-close" style="background:#f4f6fb;border:none;border-radius:8px;width:30px;height:30px;font-size:16px;cursor:pointer;color:#6b7280">✕</button>'
    +   '</div>'
    +   '<div style="padding:16px 20px;display:flex;flex-direction:column;gap:10px">'
    +     '<div style="background:#f4f6fb;border-radius:10px;padding:12px;font-size:12px;color:#6b7280;line-height:1.6">'
    +       '<strong style="color:#111827">Kennwerte:</strong> '+E(_defaultKennwerte(d))
    +     '</div>'
    +     (p.status!=='verifiziert' ? '<div style="background:#fef3c7;border:1.5px solid #fde68a;border-radius:10px;padding:10px 12px;font-size:12px;color:#92400e">⚠ Nicht verifiziert — Daten aus öffentlichen Datenblättern. Bitte im Datenblatt verifizieren.</div>' : '')
    +   '</div>'
    +   '<div style="padding:14px 20px;border-top:1.5px solid #e2e8f0;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">'
    +     '<button class="gaw-close" style="padding:8px 16px;border-radius:8px;border:1.5px solid #cdd4e4;background:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;color:#111827">Schliessen</button>'
    +     '<button class="gaw-uebernehmen" style="padding:8px 16px;border-radius:8px;border:none;background:'+cfg.accent+';color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">✓ Anlage übernehmen</button>'
    +     '<button class="gaw-offerte" style="padding:8px 16px;border-radius:8px;border:none;background:#f59e0b;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">📨 Offerte anfragen</button>'
    +   '</div>'
    + '</div>';
    document.body.appendChild(overlay);
    overlay.querySelectorAll('.gaw-close').forEach(function(b){ b.addEventListener('click', function(){ _removeOverlay(overlay); }); });
    overlay.querySelector('.gaw-uebernehmen').addEventListener('click', function(){
      _removeOverlay(overlay);
      if(typeof cfg.onAnlageUebernommen === 'function') {
        try { cfg.onAnlageUebernommen(p); } catch(e) { console.warn(e); }
      }
      _toast('✓ Anlage übernommen: '+(p.lieferantFirma||'')+' '+(d.serie||'')+' '+(d.modell||''), cfg.accent);
    });
    overlay.querySelector('.gaw-offerte').addEventListener('click', function(){
      _removeOverlay(overlay);
      _openOfferteDialog(state, p);
    });
  }

  // ── Offertanfrage-Dialog (Katalog + Switch "Anderen Lieferanten") ──
  function _openOfferteDialog(state, produkt){
    var cfg = state.cfg;
    var d = produkt ? (produkt.daten || {}) : {};
    var projekt = (cfg.getProjekt && cfg.getProjekt()) || { name:'', ort:'', objektId:'' };
    var overlay = _makeOverlay();
    overlay.innerHTML =
      '<div style="background:#fff;border-radius:16px;max-width:520px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,.25);overflow:hidden;font-family:\'DM Sans\',system-ui,sans-serif">'
    +   '<div style="padding:16px 20px;border-bottom:1.5px solid #e2e8f0">'
    +     '<div style="font-size:16px;font-weight:800">📨 Offertanfrage senden</div>'
    +     '<div style="font-size:12px;color:#6b7280;margin-top:4px">'+E(produkt.lieferantFirma||'')+' · '+E(d.serie||'')+' '+E(d.modell||'')+'</div>'
    +   '</div>'
    +   '<div style="padding:16px 20px;display:flex;flex-direction:column;gap:10px">'
    +     '<button class="gaw-switch-extern" type="button" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-radius:10px;border:1.5px dashed #fde68a;background:#fffbeb;color:#92400e;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;text-align:left" title="Nicht diese Anlage? Anfrage an einen anderen oder neuen Lieferanten senden.">'
    +       '<span>Anderen / neuen Lieferanten anfragen</span>'
    +       '<span style="font-size:14px">→</span>'
    +     '</button>'
    +     '<div><label style="font-size:12px;font-weight:700;color:#6b7280;display:block;margin-bottom:4px">Projekt / Bauvorhaben</label>'
    +       '<input type="text" class="gaw-f-projekt" value="'+E(projekt.name||'').replace(/"/g,'&quot;')+'" style="width:100%;padding:8px 10px;border:1.5px solid #cdd4e4;border-radius:8px;font-size:13px;font-family:inherit"/></div>'
    +     '<div><label style="font-size:12px;font-weight:700;color:#6b7280;display:block;margin-bottom:4px">Frist (Tage)</label>'
    +       '<input type="number" class="gaw-f-frist" value="14" min="1" max="90" style="width:120px;padding:8px 10px;border:1.5px solid #cdd4e4;border-radius:8px;font-size:13px;font-family:inherit"/></div>'
    +     '<div><label style="font-size:12px;font-weight:700;color:#6b7280;display:block;margin-bottom:4px">Nachricht (optional)</label>'
    +       '<textarea class="gaw-f-msg" rows="3" placeholder="z.B. Bitte Offerte inkl. Montage, Liefertermin…" style="width:100%;padding:8px 10px;border:1.5px solid #cdd4e4;border-radius:8px;font-size:13px;font-family:inherit;resize:vertical"></textarea></div>'
    +     '<div style="background:#f4f6fb;border-radius:8px;padding:10px;font-size:12px;color:#6b7280;line-height:1.5">'
    +       '<strong>Berechnungsergebnis:</strong> '+E(_defaultKennwerte((cfg.getBerechnungswerte && cfg.getBerechnungswerte())||{}))
    +     '</div>'
    +   '</div>'
    +   '<div style="padding:14px 20px;border-top:1.5px solid #e2e8f0;display:flex;gap:8px;justify-content:flex-end">'
    +     '<button class="gaw-cancel" style="padding:8px 16px;border-radius:8px;border:1.5px solid #cdd4e4;background:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;color:#111827">Abbrechen</button>'
    +     '<button class="gaw-send" style="padding:8px 16px;border-radius:8px;border:none;background:#f59e0b;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">📨 Anfrage an '+E(produkt.lieferantFirma||'Lieferant')+' senden</button>'
    +   '</div>'
    + '</div>';
    document.body.appendChild(overlay);
    overlay.querySelector('.gaw-cancel').addEventListener('click', function(){ _removeOverlay(overlay); });
    overlay.querySelector('.gaw-switch-extern').addEventListener('click', function(){
      var vorab = {
        projekt: overlay.querySelector('.gaw-f-projekt').value || projekt.name,
        nachricht: overlay.querySelector('.gaw-f-msg').value || '',
        frist: parseInt(overlay.querySelector('.gaw-f-frist').value,10) || 14
      };
      _removeOverlay(overlay);
      _openExternalDialog(state, { name: vorab.projekt }, vorab);
    });
    overlay.querySelector('.gaw-send').addEventListener('click', function(){
      var werte = (cfg.getBerechnungswerte && cfg.getBerechnungswerte()) || {};
      try {
        GemaProdukte.createOffertanfrage({
          lieferantId: produkt.lieferantId,
          lieferantFirma: produkt.lieferantFirma,
          produktId: produkt.id,
          produktName: (d.serie||'')+' '+(d.modell||''),
          kategorie: cfg.kategorie,
          berechnungswerte: werte,
          projekt: {
            name: overlay.querySelector('.gaw-f-projekt').value || '',
            ort: projekt.ort || '',
            objektId: projekt.objektId || ''
          },
          nachricht: overlay.querySelector('.gaw-f-msg').value || '',
          fristTage: parseInt(overlay.querySelector('.gaw-f-frist').value,10) || 14
        });
      } catch(e) { console.warn('[GemaAnlagenwahl] createOffertanfrage', e); }
      _removeOverlay(overlay);
      _toast('📨 Offertanfrage an '+(produkt.lieferantFirma||'Lieferant')+' gesendet', '#f59e0b');
    });
  }

  // ── Externer Dialog (via GemaOfferRequest) ──
  function _openExternalDialog(state, projektOverride, vorbelegung){
    if(typeof GemaOfferRequest === 'undefined'){
      alert('Offerten-Modul nicht geladen');
      return;
    }
    var cfg = state.cfg;
    var projekt = projektOverride || (cfg.getProjekt && cfg.getProjekt()) || { name:'', ort:'', objektId:'' };
    GemaOfferRequest.open({
      kategorie: cfg.kategorie,
      titel: cfg.titel || 'Anlage',
      produktName: (cfg.titel || 'Anlage') + ' (Planung)',
      berechnungswerte: (cfg.getBerechnungswerte && cfg.getBerechnungswerte()) || {},
      projekt: {
        name: projekt.name || '',
        ort:  projekt.ort  || '',
        objektId: ((cfg.getProjekt && cfg.getProjekt()) || {}).objektId || projekt.objektId || ''
      },
      vorbelegung: vorbelegung || {}
    });
  }

  // ── Utils ──
  function _makeOverlay(){
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:9400;background:rgba(15,23,42,.55);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px';
    document.body.classList.add('modal-open');
    return ov;
  }
  function _removeOverlay(ov){
    ov.remove();
    if(!document.querySelector('[style*="position:fixed"][style*="inset:0"]'))document.body.classList.remove('modal-open');
  }
  function _toast(msg, color){
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:'+(color||'#0f172a')+';color:#fff;padding:12px 24px;border-radius:10px;font-size:13px;font-weight:700;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,.25);font-family:"DM Sans",system-ui,sans-serif';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function(){ t.remove(); }, 3500);
  }

  // Auto-Scroll zum Anlagenwahl-Bereich mit kurzem Puls-Highlight (P03).
  // Wird vom Modul aufgerufen, sobald die Haupt-Berechnung ein valides
  // Ergebnis hat (z.B. beim ersten Mal). Zeigt dem Planer, dass jetzt
  // ein passendes Produkt gewaehlt werden kann.
  function scrollToResults(containerIdOrEl){
    var el = typeof containerIdOrEl === 'string'
      ? document.querySelector(containerIdOrEl.charAt(0)==='#'?containerIdOrEl:'#'+containerIdOrEl)
      : containerIdOrEl;
    if(!el) return;
    try { el.scrollIntoView({ behavior:'smooth', block:'start' }); } catch(e) { el.scrollIntoView(); }
    var card = el.querySelector && el.querySelector('.gaw-card') || el;
    var orig = card.style.boxShadow;
    card.style.transition = 'box-shadow .6s ease';
    card.style.boxShadow = '0 0 0 3px rgba(37,99,235,.35), 0 10px 30px rgba(37,99,235,.2)';
    setTimeout(function(){ card.style.boxShadow = orig || ''; }, 1600);
  }

  w.GemaAnlagenwahl = {
    init: init,
    // Optional: Re-Rendering von aussen triggern, wenn sich die
    // Berechnungswerte geaendert haben (keine Seite reloaden).
    refresh: function(containerIdOrEl){
      var id = typeof containerIdOrEl === 'string' ? containerIdOrEl.replace('#','') : (containerIdOrEl && containerIdOrEl.id);
      var st = _instances[id];
      if(st) _renderGrid(st);
    },
    scrollToResults: scrollToResults
  };
})(window);
