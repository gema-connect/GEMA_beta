# Konzept: Fahrzeug-Management-Modals — if_fahrzeug.html
> Für Claude Code: Bitte die 5 Schritte **einzeln** umsetzen, nicht zusammen.
> Jeder Schritt ist für sich abgeschlossen und testbar.

---

## Ausgangslage

Die Datei `if_fahrzeug.html` hat:
- ✅ Edit-Modal (Fahrzeugdaten erfassen/bearbeiten)
- ✅ View-Modal (QR-Scan Ansicht, `openViewFzg`)
- ✅ QR-Code Generator
- ❌ Felder Garage/Reifen/Tankkarte im Edit-Formular fehlen
- ❌ Management-Modals fehlen komplett

Alle Daten werden im localStorage unter dem Key `gema_vehicles` (Array) gespeichert.
Management-Events werden pro Fahrzeug in `v.events[]` gespeichert (Array of objects).

---

## Schritt 1 — Edit-Formular: Felder Garage, Reifen, Tankkarte

**Ziel:** Drei neue Felder im bestehenden Edit-Modal.

**HTML** — Füge nach der Sektion "Kilometerstand & Service" (nach dem `</div>` der `.form-section`) und VOR der Sektion "Notizen" eine neue Section ein:

```html
<div class="form-section">
  <div class="form-section-title">Garage &amp; Dokumente</div>
  <div class="form-grid">
    <div class="field">
      <label class="label">Garage / Werkstatt</label>
      <input class="inp" id="fGarage" placeholder="z. B. AMAG Zürich"/>
      <span class="hint">Partnerwerkstatt oder interne Garage</span>
    </div>
    <div class="field">
      <label class="label">Tankkarte Nr.</label>
      <input class="inp" id="fFuelCard" placeholder="z. B. TC-4521"/>
    </div>
    <div class="field form-full">
      <label class="label">Reifen (aktuell montiert)</label>
      <input class="inp" id="fTires" placeholder="z. B. Michelin Pilot Sport 205/55 R16 — Sommer"/>
      <span class="hint">Marke, Grösse, Typ</span>
    </div>
  </div>
</div>
```

**JS — openModal:** In der `if(id){...}` Branch nach den bestehenden `$f(...)` Aufrufen ergänzen:
```js
$f("fGarage", v.garage);
$f("fFuelCard", v.fuelCard);
$f("fTires", v.tires);
```

**JS — saveVehicle:** Im `data = {...}` Objekt ergänzen (z.B. nach `mfk`):
```js
garage: document.getElementById("fGarage").value.trim(),
fuelCard: document.getElementById("fFuelCard").value.trim(),
tires: document.getElementById("fTires").value.trim(),
```

**JS — openViewFzg:** In der vm-body Section "Service & Termine" die drei Felder hinzufügen:
```js
html+=vmf('Garage',v.garage||'—');
html+=vmf('Tankkarte',v.fuelCard||'—');
html+=vmf('Reifen',v.tires||'—');
```

---

## Schritt 2 — Management-Modal Infrastruktur + Zuweisung-Modal

**Ziel:** Eine wiederverwendbare Modal-Infrastruktur und das erste Management-Modal (Zuweisung ändern).

### CSS — am Ende des `<style>` Blocks hinzufügen:
```css
/* ═══ MANAGEMENT MODALS ═══ */
.mgmt-overlay{position:fixed;inset:0;background:rgba(15,23,42,.5);backdrop-filter:blur(6px);z-index:600;display:none;align-items:flex-start;justify-content:center;padding:40px 20px;overflow-y:auto;}
.mgmt-overlay.open{display:flex;}
.mgmt-modal{background:var(--surface);border-radius:var(--r-lg);box-shadow:var(--shadow-lg);width:100%;max-width:520px;animation:modalIn .22s ease-out;}
.mgmt-hd{padding:18px 22px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;}
.mgmt-hd-icon{font-size:22px;width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.mgmt-hd h3{font-size:15px;font-weight:800;color:var(--text);flex:1;}
.mgmt-hd .modal-close{width:30px;height:30px;border-radius:7px;border:1px solid var(--border);background:var(--surface);color:var(--muted);font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.15s;font-family:var(--sans);}
.mgmt-hd .modal-close:hover{background:var(--red-bg);color:var(--red);}
.mgmt-bd{padding:20px 22px;}
.mgmt-ft{padding:14px 22px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;background:var(--surface2);border-radius:0 0 var(--r-lg) var(--r-lg);}
.mgmt-veh-tag{display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--primary-bg);border:1px solid var(--primary-bd);border-radius:var(--r-sm);margin-bottom:16px;font-size:12.5px;font-weight:700;color:var(--primary);}
.event-list{display:flex;flex-direction:column;gap:8px;max-height:260px;overflow-y:auto;}
.event-item{padding:10px 14px;border:1px solid var(--border);border-radius:var(--r-sm);background:var(--surface2);font-size:12.5px;}
.event-item-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;}
.event-item-type{font-weight:700;color:var(--text);font-size:12px;}
.event-item-date{font-size:11px;color:var(--muted2);font-family:var(--mono);}
.event-item-body{color:var(--text2);line-height:1.4;}
.event-item.defekt .event-item-type{color:var(--red);}
.event-item.kosten .event-item-type{color:var(--amber);}
.event-item.reifen .event-item-type{color:var(--cyan);}
.event-item.parkk .event-item-type{color:var(--purple);}
.event-item.zuweisung .event-item-type{color:var(--primary);}
.event-empty{padding:24px;text-align:center;color:var(--muted);font-size:13px;}
```

### HTML — Zuweisung-Modal (direkt vor dem QR MODAL Comment einfügen):
```html
<!-- ZUWEISUNG MODAL -->
<div class="mgmt-overlay" id="mgmtZuweisungOverlay">
  <div class="mgmt-modal">
    <div class="mgmt-hd">
      <div class="mgmt-hd-icon" style="background:var(--primary-bg);">👤</div>
      <h3>Zuweisung ändern</h3>
      <button class="modal-close" onclick="closeMgmt('mgmtZuweisungOverlay')">✕</button>
    </div>
    <div class="mgmt-bd">
      <div class="mgmt-veh-tag" id="zuweisungVehTag">—</div>
      <div class="form-grid">
        <div class="field">
          <label class="label">Zugeteilter Fahrer</label>
          <input class="inp" id="zuweisungDriver" placeholder="Name Fahrer"/>
        </div>
        <div class="field">
          <label class="label">Abteilung</label>
          <input class="inp" id="zuweisungDept" placeholder="z. B. Sanitär"/>
        </div>
        <div class="field form-full">
          <label class="label">Zuteilung</label>
          <select class="sel" id="zuweisungType">
            <option value="fix">Fix zugeteilt</option>
            <option value="sharing">Sharing / Pool</option>
          </select>
        </div>
        <div class="field form-full">
          <label class="label">Bemerkung</label>
          <textarea class="textarea" id="zuweisungNote" placeholder="Optional: Bemerkung zur Änderung" style="min-height:52px;"></textarea>
        </div>
      </div>
    </div>
    <div class="mgmt-ft">
      <button class="btn" onclick="closeMgmt('mgmtZuweisungOverlay')">Abbrechen</button>
      <button class="btn primary" onclick="saveZuweisung()">💾 Speichern</button>
    </div>
  </div>
</div>
```

### JS — Helper-Funktionen (am Ende des IIFE, vor dem letzten `})()...`):
```js
/* ═══════════════════════════════
   MANAGEMENT MODAL HELPERS
   ═══════════════════════════════ */
let _mgmtVehicleId = null;

function openMgmt(overlayId, vehicleId) {
  _mgmtVehicleId = vehicleId;
  document.getElementById(overlayId).classList.add('open');
  document.body.style.overflow = 'hidden';
}
window.openMgmt = openMgmt;

function closeMgmt(overlayId) {
  document.getElementById(overlayId).classList.remove('open');
  document.body.style.overflow = '';
}
window.closeMgmt = closeMgmt;

function addVehicleEvent(vehicleId, type, data) {
  const v = vehicles.find(x => x.id === vehicleId);
  if (!v) return;
  if (!v.events) v.events = [];
  v.events.unshift({ type, date: new Date().toISOString(), ...data });
  persist();
}

function vehTag(v) {
  return '🚐 ' + esc(v.nr) + ' &nbsp;·&nbsp; ' + esc(v.plate) + ' &nbsp;·&nbsp; ' + esc(v.model);
}

/* ═══ ZUWEISUNG ═══ */
function openZuweisung(vehicleId) {
  const v = vehicles.find(x => x.id === vehicleId);
  if (!v) return;
  document.getElementById('zuweisungVehTag').innerHTML = vehTag(v);
  document.getElementById('zuweisungDriver').value = v.driver || '';
  document.getElementById('zuweisungDept').value = v.dept || '';
  document.getElementById('zuweisungType').value = v.assignment || 'fix';
  document.getElementById('zuweisungNote').value = '';
  openMgmt('mgmtZuweisungOverlay', vehicleId);
}
window.openZuweisung = openZuweisung;

function saveZuweisung() {
  const v = vehicles.find(x => x.id === _mgmtVehicleId);
  if (!v) return;
  const oldDriver = v.driver;
  v.driver = document.getElementById('zuweisungDriver').value.trim();
  v.dept = document.getElementById('zuweisungDept').value.trim();
  v.assignment = document.getElementById('zuweisungType').value;
  v.updatedAt = new Date().toISOString();
  const note = document.getElementById('zuweisungNote').value.trim();
  addVehicleEvent(_mgmtVehicleId, 'zuweisung', {
    label: 'Zuweisung geändert',
    detail: (oldDriver ? oldDriver + ' → ' : '') + (v.driver || 'Kein Fahrer') + (note ? ' | ' + note : '')
  });
  persist(); render();
  closeMgmt('mgmtZuweisungOverlay');
  showToast('Zuweisung gespeichert ✓');
}
window.saveZuweisung = saveZuweisung;
```

### Trigger-Button — in der Card-View (in `renderCards`, im `v-card-footer` div):
Im bestehenden `renderCards` Footer-Bereich den QR-Button ergänzen um einen Zuweisung-Button:
```js
// Bestehender Code (Referenz):
`<button class="g-nav-btn" style="padding:4px 9px;font-size:11px;" onclick="event.stopPropagation();openFzgQR('${v.id}')">🔲 QR</button>`

// DANACH hinzufügen:
`<button class="g-nav-btn" style="padding:4px 9px;font-size:11px;" onclick="event.stopPropagation();openZuweisung('${v.id}')">👤</button>`
```

---

## Schritt 3 — Defekt-Modal + Kosten-Modal

### HTML — Defekt-Modal (nach dem Zuweisung-Modal einfügen):
```html
<!-- DEFEKT MODAL -->
<div class="mgmt-overlay" id="mgmtDefektOverlay">
  <div class="mgmt-modal">
    <div class="mgmt-hd">
      <div class="mgmt-hd-icon" style="background:var(--red-bg);">🔧</div>
      <h3>Defekt melden</h3>
      <button class="modal-close" onclick="closeMgmt('mgmtDefektOverlay')">✕</button>
    </div>
    <div class="mgmt-bd">
      <div class="mgmt-veh-tag" id="defektVehTag">—</div>
      <div class="form-grid">
        <div class="field form-full">
          <label class="label">Defekt / Problem *</label>
          <textarea class="textarea" id="defektDesc" placeholder="Was ist defekt? Kurze Beschreibung …" style="min-height:70px;"></textarea>
        </div>
        <div class="field">
          <label class="label">Priorität</label>
          <select class="sel" id="defektPrio">
            <option value="normal">Normal</option>
            <option value="hoch">Hoch — baldige Reparatur</option>
            <option value="kritisch">Kritisch — sofort</option>
          </select>
        </div>
        <div class="field">
          <label class="label">Km-Stand bei Meldung</label>
          <input class="inp" id="defektKm" type="text" inputmode="decimal" onblur="fixLeadingZero(this)" placeholder="z. B. 47500"/>
        </div>
      </div>
    </div>
    <div class="mgmt-ft">
      <button class="btn" onclick="closeMgmt('mgmtDefektOverlay')">Abbrechen</button>
      <button class="btn danger" onclick="saveDefekt()">🔧 Melden</button>
    </div>
  </div>
</div>

<!-- KOSTEN MODAL -->
<div class="mgmt-overlay" id="mgmtKostenOverlay">
  <div class="mgmt-modal">
    <div class="mgmt-hd">
      <div class="mgmt-hd-icon" style="background:var(--amber-bg);">💰</div>
      <h3>Kosten erfassen</h3>
      <button class="modal-close" onclick="closeMgmt('mgmtKostenOverlay')">✕</button>
    </div>
    <div class="mgmt-bd">
      <div class="mgmt-veh-tag" id="kostenVehTag">—</div>
      <div class="form-grid">
        <div class="field">
          <label class="label">Kategorie</label>
          <select class="sel" id="kostenKat">
            <option value="Treibstoff">⛽ Treibstoff</option>
            <option value="Service">🔧 Service / Wartung</option>
            <option value="Reparatur">🛠 Reparatur</option>
            <option value="Reifen">🔵 Reifen</option>
            <option value="Versicherung">🛡 Versicherung</option>
            <option value="Steuern">📋 Steuern / Gebühren</option>
            <option value="Reinigung">🧹 Reinigung</option>
            <option value="Sonstiges">📦 Sonstiges</option>
          </select>
        </div>
        <div class="field">
          <label class="label">Betrag (CHF)</label>
          <input class="inp" id="kostenBetrag" type="text" inputmode="decimal" onblur="fixLeadingZero(this)" placeholder="z. B. 185.50"/>
        </div>
        <div class="field">
          <label class="label">Datum</label>
          <input class="inp" id="kostenDatum" type="date"/>
        </div>
        <div class="field">
          <label class="label">Km-Stand</label>
          <input class="inp" id="kostenKm" type="text" inputmode="decimal" onblur="fixLeadingZero(this)" placeholder="z. B. 47500"/>
        </div>
        <div class="field form-full">
          <label class="label">Bemerkung</label>
          <input class="inp" id="kostenNote" placeholder="Optional: Lieferant, Belegnr., …"/>
        </div>
      </div>
    </div>
    <div class="mgmt-ft">
      <button class="btn" onclick="closeMgmt('mgmtKostenOverlay')">Abbrechen</button>
      <button class="btn primary" onclick="saveKosten()">💾 Speichern</button>
    </div>
  </div>
</div>
```

### JS — Defekt + Kosten (am Ende des IIFE, nach dem Zuweisung-Block):
```js
/* ═══ DEFEKT ═══ */
function openDefekt(vehicleId) {
  const v = vehicles.find(x => x.id === vehicleId); if (!v) return;
  document.getElementById('defektVehTag').innerHTML = vehTag(v);
  document.getElementById('defektDesc').value = '';
  document.getElementById('defektPrio').value = 'normal';
  document.getElementById('defektKm').value = v.km || '';
  openMgmt('mgmtDefektOverlay', vehicleId);
}
window.openDefekt = openDefekt;

function saveDefekt() {
  const desc = document.getElementById('defektDesc').value.trim();
  if (!desc) { showToast('Bitte Defekt beschreiben.'); return; }
  const prio = document.getElementById('defektPrio').value;
  const km = document.getElementById('defektKm').value;
  addVehicleEvent(_mgmtVehicleId, 'defekt', {
    label: 'Defekt: ' + (prio === 'kritisch' ? '🚨 ' : prio === 'hoch' ? '⚠️ ' : '') + desc.slice(0, 60),
    detail: desc + (km ? ' | ' + parseInt(km).toLocaleString('de-CH') + ' km' : ''),
    prio
  });
  closeMgmt('mgmtDefektOverlay');
  showToast('Defekt gemeldet ✓');
}
window.saveDefekt = saveDefekt;

/* ═══ KOSTEN ═══ */
function openKosten(vehicleId) {
  const v = vehicles.find(x => x.id === vehicleId); if (!v) return;
  document.getElementById('kostenVehTag').innerHTML = vehTag(v);
  document.getElementById('kostenKat').value = 'Treibstoff';
  document.getElementById('kostenBetrag').value = '';
  document.getElementById('kostenDatum').value = new Date().toISOString().slice(0, 10);
  document.getElementById('kostenKm').value = v.km || '';
  document.getElementById('kostenNote').value = '';
  openMgmt('mgmtKostenOverlay', vehicleId);
}
window.openKosten = openKosten;

function saveKosten() {
  const betrag = document.getElementById('kostenBetrag').value.trim();
  if (!betrag) { showToast('Bitte Betrag eingeben.'); return; }
  const kat = document.getElementById('kostenKat').value;
  const datum = document.getElementById('kostenDatum').value;
  const km = document.getElementById('kostenKm').value;
  const note = document.getElementById('kostenNote').value.trim();
  addVehicleEvent(_mgmtVehicleId, 'kosten', {
    label: kat + ': CHF ' + parseFloat(betrag).toFixed(2),
    detail: (datum ? fmtDate(datum) + ' | ' : '') + (km ? parseInt(km).toLocaleString('de-CH') + ' km' : '') + (note ? ' | ' + note : '')
  });
  closeMgmt('mgmtKostenOverlay');
  showToast('Kosten erfasst ✓');
}
window.saveKosten = saveKosten;
```

---

## Schritt 4 — Reifenwechsel-Modal + Parkkarten-Modal

### HTML — beide Modals (nach den Kosten-Modal einfügen):
```html
<!-- REIFENWECHSEL MODAL -->
<div class="mgmt-overlay" id="mgmtReifenOverlay">
  <div class="mgmt-modal">
    <div class="mgmt-hd">
      <div class="mgmt-hd-icon" style="background:var(--cyan-bg);">🔵</div>
      <h3>Reifenwechsel erfassen</h3>
      <button class="modal-close" onclick="closeMgmt('mgmtReifenOverlay')">✕</button>
    </div>
    <div class="mgmt-bd">
      <div class="mgmt-veh-tag" id="reifenVehTag">—</div>
      <div class="form-grid">
        <div class="field">
          <label class="label">Typ</label>
          <select class="sel" id="reifenTyp">
            <option value="Sommerreifen">☀️ Sommerreifen</option>
            <option value="Winterreifen">❄️ Winterreifen</option>
            <option value="Ganzjahresreifen">🔄 Ganzjahresreifen</option>
          </select>
        </div>
        <div class="field">
          <label class="label">Datum</label>
          <input class="inp" id="reifenDatum" type="date"/>
        </div>
        <div class="field">
          <label class="label">Km-Stand</label>
          <input class="inp" id="reifenKm" type="text" inputmode="decimal" onblur="fixLeadingZero(this)" placeholder="z. B. 47500"/>
        </div>
        <div class="field">
          <label class="label">Kosten (CHF)</label>
          <input class="inp" id="reifenKosten" type="text" inputmode="decimal" onblur="fixLeadingZero(this)" placeholder="Optional"/>
        </div>
        <div class="field form-full">
          <label class="label">Reifen-Bezeichnung</label>
          <input class="inp" id="reifenDesc" placeholder="z. B. Michelin CrossClimate 205/55 R16"/>
        </div>
        <div class="field form-full">
          <label class="label">Lagerort alte Reifen</label>
          <input class="inp" id="reifenLager" placeholder="z. B. Lager Halle 2, Regal A3"/>
        </div>
      </div>
    </div>
    <div class="mgmt-ft">
      <button class="btn" onclick="closeMgmt('mgmtReifenOverlay')">Abbrechen</button>
      <button class="btn primary" onclick="saveReifen()">💾 Speichern</button>
    </div>
  </div>
</div>

<!-- PARKKARTEN MODAL -->
<div class="mgmt-overlay" id="mgmtParkkOverlay">
  <div class="mgmt-modal">
    <div class="mgmt-hd">
      <div class="mgmt-hd-icon" style="background:var(--purple-bg);">🅿️</div>
      <h3>Parkkarte verwalten</h3>
      <button class="modal-close" onclick="closeMgmt('mgmtParkkOverlay')">✕</button>
    </div>
    <div class="mgmt-bd">
      <div class="mgmt-veh-tag" id="parkkVehTag">—</div>
      <div class="form-grid">
        <div class="field">
          <label class="label">Aktion</label>
          <select class="sel" id="parkkAktion">
            <option value="Hinzugefügt">➕ Parkkarte hinzugefügt</option>
            <option value="Erneuert">🔄 Erneuert / verlängert</option>
            <option value="Zurückgegeben">↩️ Zurückgegeben</option>
            <option value="Verloren">⚠️ Verloren / gesperrt</option>
          </select>
        </div>
        <div class="field">
          <label class="label">Gültig bis</label>
          <input class="inp" id="parkkGueltig" type="date"/>
        </div>
        <div class="field form-full">
          <label class="label">Zone / Ort</label>
          <input class="inp" id="parkkZone" placeholder="z. B. Blaue Zone Basel, Parkhaus XY"/>
        </div>
        <div class="field form-full">
          <label class="label">Parkkarten-Nr. / Kennzeichen</label>
          <input class="inp" id="parkkNr" placeholder="z. B. PK-2024-088"/>
        </div>
      </div>
    </div>
    <div class="mgmt-ft">
      <button class="btn" onclick="closeMgmt('mgmtParkkOverlay')">Abbrechen</button>
      <button class="btn primary" onclick="saveParkk()">💾 Speichern</button>
    </div>
  </div>
</div>
```

### JS — Reifen + Parkk (am Ende des IIFE nach Kosten-Block):
```js
/* ═══ REIFEN ═══ */
function openReifen(vehicleId) {
  const v = vehicles.find(x => x.id === vehicleId); if (!v) return;
  document.getElementById('reifenVehTag').innerHTML = vehTag(v);
  document.getElementById('reifenTyp').value = 'Sommerreifen';
  document.getElementById('reifenDatum').value = new Date().toISOString().slice(0, 10);
  document.getElementById('reifenKm').value = v.km || '';
  document.getElementById('reifenKosten').value = '';
  document.getElementById('reifenDesc').value = v.tires || '';
  document.getElementById('reifenLager').value = '';
  openMgmt('mgmtReifenOverlay', vehicleId);
}
window.openReifen = openReifen;

function saveReifen() {
  const typ = document.getElementById('reifenTyp').value;
  const datum = document.getElementById('reifenDatum').value;
  const km = document.getElementById('reifenKm').value;
  const kosten = document.getElementById('reifenKosten').value.trim();
  const desc = document.getElementById('reifenDesc').value.trim();
  const lager = document.getElementById('reifenLager').value.trim();
  const v = vehicles.find(x => x.id === _mgmtVehicleId);
  if (v && desc) v.tires = desc; // aktuell montierten Reifen updaten
  addVehicleEvent(_mgmtVehicleId, 'reifen', {
    label: 'Reifenwechsel: ' + typ,
    detail: [desc, datum ? fmtDate(datum) : '', km ? parseInt(km).toLocaleString('de-CH') + ' km' : '', kosten ? 'CHF ' + parseFloat(kosten).toFixed(2) : '', lager ? 'Lager: ' + lager : ''].filter(Boolean).join(' | ')
  });
  persist(); render();
  closeMgmt('mgmtReifenOverlay');
  showToast('Reifenwechsel erfasst ✓');
}
window.saveReifen = saveReifen;

/* ═══ PARKKARTE ═══ */
function openParkk(vehicleId) {
  const v = vehicles.find(x => x.id === vehicleId); if (!v) return;
  document.getElementById('parkkVehTag').innerHTML = vehTag(v);
  document.getElementById('parkkAktion').value = 'Hinzugefügt';
  document.getElementById('parkkGueltig').value = '';
  document.getElementById('parkkZone').value = '';
  document.getElementById('parkkNr').value = '';
  openMgmt('mgmtParkkOverlay', vehicleId);
}
window.openParkk = openParkk;

function saveParkk() {
  const aktion = document.getElementById('parkkAktion').value;
  const gueltig = document.getElementById('parkkGueltig').value;
  const zone = document.getElementById('parkkZone').value.trim();
  const nr = document.getElementById('parkkNr').value.trim();
  addVehicleEvent(_mgmtVehicleId, 'parkk', {
    label: 'Parkkarte: ' + aktion,
    detail: [zone, nr, gueltig ? 'bis ' + fmtDate(gueltig) : ''].filter(Boolean).join(' | ')
  });
  closeMgmt('mgmtParkkOverlay');
  showToast('Parkkarte gespeichert ✓');
}
window.saveParkk = saveParkk;
```

---

## Schritt 5 — Berichte-Modal (Fahrzeughistorie) + Action-Buttons im View-Modal

### HTML — Berichte-Modal (nach Parkkarten-Modal einfügen):
```html
<!-- BERICHTE / HISTORIE MODAL -->
<div class="mgmt-overlay" id="mgmtBerichteOverlay">
  <div class="mgmt-modal" style="max-width:600px;">
    <div class="mgmt-hd">
      <div class="mgmt-hd-icon" style="background:var(--green-bg);">📋</div>
      <h3>Fahrzeughistorie</h3>
      <button class="modal-close" onclick="closeMgmt('mgmtBerichteOverlay')">✕</button>
    </div>
    <div class="mgmt-bd">
      <div class="mgmt-veh-tag" id="berichteVehTag">—</div>
      <div id="berichteList" class="event-list"></div>
    </div>
    <div class="mgmt-ft">
      <button class="btn" onclick="closeMgmt('mgmtBerichteOverlay')">Schliessen</button>
    </div>
  </div>
</div>
```

### JS — Berichte-Funktion (am Ende des IIFE):
```js
/* ═══ BERICHTE ═══ */
function openBerichte(vehicleId) {
  const v = vehicles.find(x => x.id === vehicleId); if (!v) return;
  document.getElementById('berichteVehTag').innerHTML = vehTag(v);
  const list = document.getElementById('berichteList');
  const events = v.events || [];
  if (events.length === 0) {
    list.innerHTML = '<div class="event-empty">Noch keine Einträge vorhanden.</div>';
  } else {
    list.innerHTML = events.map(e => `
      <div class="event-item ${e.type||''}">
        <div class="event-item-hd">
          <span class="event-item-type">${esc(e.label||e.type)}</span>
          <span class="event-item-date">${e.date ? new Date(e.date).toLocaleDateString('de-CH', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'}</span>
        </div>
        ${e.detail ? '<div class="event-item-body">'+esc(e.detail)+'</div>' : ''}
      </div>`).join('');
  }
  openMgmt('mgmtBerichteOverlay', vehicleId);
}
window.openBerichte = openBerichte;
```

### HTML — Action-Buttons im View-Modal (.vm-actions div ersetzen):
```html
<!-- ERSETZT das bestehende .vm-actions div -->
<div class="vm-actions" style="flex-wrap:wrap;gap:8px;">
  <button class="btn" style="flex:1 1 120px;justify-content:center;" onclick="closeViewModal()">Schliessen</button>
  <button class="btn" style="flex:1 1 120px;justify-content:center;" onclick="openBerichte(_lastViewId)">📋 Historie</button>
  <button class="btn" style="flex:1 1 120px;justify-content:center;" onclick="openDefekt(_lastViewId)">🔧 Defekt</button>
  <button class="btn" style="flex:1 1 120px;justify-content:center;" onclick="openKosten(_lastViewId)">💰 Kosten</button>
  <button class="btn primary" style="flex:1 1 120px;justify-content:center;" id="vm_editBtn">✏️ Bearbeiten</button>
</div>
```

### JS — `_lastViewId` verwalten (in `openViewFzg` am Anfang hinzufügen):
```js
// Am Anfang von openViewFzg() nach "const v = vehicles.find(...)":
window._lastViewId = id;
```

### Keyboard-Close für alle Management-Modals (bestehenden keydown-Listener erweitern):
```js
// Den bestehenden Escape-Listener ersetzen:
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    closeModal(); closeViewModal();
    ['mgmtZuweisungOverlay','mgmtDefektOverlay','mgmtKostenOverlay',
     'mgmtReifenOverlay','mgmtParkkOverlay','mgmtBerichteOverlay'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('open');
    });
    document.body.style.overflow = '';
  }
});
```

---

## Zusammenfassung Änderungen pro Schritt

| Schritt | Was | Wo |
|---|---|---|
| 1 | Garage/Reifen/Tankkarte Felder | HTML Formular + JS openModal + saveVehicle + openViewFzg |
| 2 | CSS mgmt-modals + Zuweisung-Modal | Style-Block + HTML + JS-IIFE |
| 3 | Defekt-Modal + Kosten-Modal | HTML + JS-IIFE |
| 4 | Reifen-Modal + Parkkarten-Modal | HTML + JS-IIFE |
| 5 | Berichte-Modal + Action-Buttons im View-Modal | HTML + JS-IIFE |

**Wichtig für Claude Code:**
- Datei: `if_fahrzeug.html`
- Kein neues IIFE — alle JS-Funktionen gehören ans Ende des bestehenden IIFE (vor dem letzten `})().catch(...)`)
- Auth-Check: `GemaAuth.getCurrentUser()` → `u.roleIds.indexOf('role_admin') >= 0` für Admin-Funktionen
- Events-Array pro Fahrzeug: `v.events[]`, wird mit `persist()` gespeichert
