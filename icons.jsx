// Mock data + initial state for GEMA Workspace prototype

const ORGS = [
  { id: 'jv', name: 'Jäggi Vollmer', short: 'JV', color: '#1e3a5f' },
  { id: 'ags', name: 'AGS', short: 'AGS', color: '#0c4a2e' },
  { id: 'fhnw', name: 'FHNW', short: 'FHNW', color: '#3B82F6' },
];

const ALL_MODULES = [
  { id: 'enth', name: 'Enthärtung', icon: 'droplet', desc: 'Wasserhärte-Berechnung' },
  { id: 'osm', name: 'Osmose', icon: 'circle-dot', desc: 'Umkehrosmose-Auslegung' },
  { id: 'lu', name: 'LU-Tabelle', icon: 'table', desc: 'Leistungs-/Umrechnung' },
  { id: 'w12', name: 'W12', icon: 'gauge', desc: 'SVGW-Richtlinie' },
  { id: 'druck', name: 'Druckerhöhung', icon: 'arrow-up', desc: 'Pumpen-Auslegung' },
  { id: 'speich', name: 'Speicher', icon: 'database', desc: 'Warmwasser-Speicher' },
];

const SAMPLE_NOTES_PENDENZEN = `<h3>Pendenzen Neubau Breisacherstrasse 32</h3>
<ul data-checklist>
  <li data-checked="true">Vorabklärung Wasserhärte mit IWB</li>
  <li data-checked="false">Osmose-Auslegung mit Bauherr abstimmen</li>
  <li data-checked="false">Druckerhöhung – Variantenvergleich erstellen</li>
</ul>
<p>Rückfrage an Architekt M. Müller bzgl. Steigzonen offen.</p>`;

const SAMPLE_NOTES_SITZUNG = `<div data-sitzung>
  <h3>Sitzung 24.04.</h3>
  <div data-participants>SC · RV · SG</div>
  <p><strong>Themen:</strong></p>
  <ul>
    <li>Festlegung Enthärtungsanlage – Variante B (Duplex)</li>
    <li>Osmose nur für Labor-Zapfstellen, nicht ganzes Haus</li>
    <li>Nächste Sitzung 08.05., RV bringt Hersteller-Angebote mit</li>
  </ul>
</div>`;

const SEED_BUCKETS = [
  {
    id: 'b-sandbox',
    name: 'Sandbox',
    type: 'private',
    org: 'jv',
    shared: false,
    members: ['SC'],
    created: '12.03.2026',
    modules: [
      { mod: 'enth', status: 'offen' },
    ],
    activity: [
      { who: 'SC', text: 'hat Sandbox erstellt', when: 'vor 1 Woche' },
    ],
    beteiligte: [],
    notes: [
      { id: 'n1', title: 'n.Seite 1', body: '<p>Spielwiese für Tests.</p>' },
    ],
  },
  {
    id: 'b-uebung-w3',
    name: 'Übung W3 Berechnung',
    type: 'training',
    org: 'fhnw',
    shared: false,
    members: ['SC'],
    created: '02.04.2026',
    modules: [
      { mod: 'lu', status: 'berechnet' },
      { mod: 'w12', status: 'offen' },
    ],
    activity: [
      { who: 'SC', text: 'hat W12 angelegt', when: 'gestern' },
    ],
    beteiligte: [],
    notes: [
      { id: 'n1', title: 'n.Seite 1', body: '<p>Übungsaufgabe FHNW Modul W3.</p>' },
    ],
  },
  {
    id: 'b-breisacher',
    name: 'Neubau Breisacherstrasse 32',
    type: 'project',
    org: 'jv',
    shared: true,
    members: ['SC', 'RV', 'SG'],
    created: '15.02.2026',
    modules: [
      { mod: 'enth', status: 'berechnet' },
      { mod: 'osm', status: 'offen' },
      { mod: 'lu', status: 'berechnet' },
    ],
    activity: [
      { who: 'SC', text: 'hat Enthärtung geändert', when: 'vor 2h' },
      { who: 'RV', text: 'hat Osmose erstellt', when: 'gestern' },
      { who: 'SG', text: 'hat Eimer geteilt', when: 'vor 3 Tagen' },
    ],
    beteiligte: [
      { role: 'Architekt', name: 'M. Müller', org: 'Müller Architekten AG' },
      { role: 'Bauherr', name: 'R. Haller', org: 'Privat' },
    ],
    notes: [
      { id: 'n1', title: 'Pendenzen', body: SAMPLE_NOTES_PENDENZEN },
      { id: 'n2', title: 'Sitzung 24.04.', body: SAMPLE_NOTES_SITZUNG },
    ],
  },
  {
    id: 'b-schulung-lj3',
    name: 'Schulung Lehrjahr 3',
    type: 'training',
    org: 'ags',
    shared: true,
    members: ['SC', 'TM', 'JK', 'BL'],
    created: '20.01.2026',
    modules: [
      { mod: 'enth', status: 'berechnet' },
      { mod: 'druck', status: 'offen' },
    ],
    activity: [
      { who: 'TM', text: 'hat Aufgabe abgegeben', when: 'vor 4h' },
      { who: 'SC', text: 'hat Feedback hinzugefügt', when: 'vor 1 Tag' },
    ],
    beteiligte: [
      { role: 'Berufsbildner', name: 'S. Caso', org: 'AGS' },
    ],
    notes: [
      { id: 'n1', title: 'Lernziele', body: '<p>Lehrjahr 3 – Sanitärinstallation</p><ul><li>Wasserhärte verstehen</li><li>Druckerhöhung dimensionieren</li></ul>' },
    ],
  },
];

const PERSONAL_BUCKETS = ['b-sandbox', 'b-uebung-w3'];
const SHARED_BUCKETS = ['b-breisacher', 'b-schulung-lj3'];

window.GEMA_DATA = {
  ORGS, ALL_MODULES, SEED_BUCKETS, PERSONAL_BUCKETS, SHARED_BUCKETS,
};
