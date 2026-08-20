/* ============================================================
   GEMA Lebensdauer-Katalog + Engine (window.GemaLebensdauer)
   ------------------------------------------------------------
   Zentrale Datenbank der Lebensdauern von Bauteilen, Materialien
   und Apparaten — Grundlage der «Paritätischen Lebensdauertabelle»
   (Schweizerischer Hauseigentümerverband + Mieterinnen- und
   Mieterverband) plus GEMA-Richtwerte für Sanitär-Leitungen und
   die Innenbeschichtungs-Systeme aus dem S+P-Systemvergleich.

   Kern: EIN Material wählen → Standard-Lebensdauer kommt aus dem
   Katalog → mit dem Einbaujahr rechnet ldBerechne das theoretische
   Lebensende, Alter, Restlebensdauer und die Zustandsampel
   (Beispiel: Einbau 1995 + 50 Jahre → Lebensende 2045).

   Quellen-Ehrlichkeit (KRITISCH): jeder Eintrag trägt `quelle` —
     'mv'   = Paritätische Lebensdauertabelle (MV/HEV)
     'mbs'  = Systemvergleich Innenbeschichtung (Herstellerangabe)
     'gema' = GEMA-Richtwert (nicht paritätisch festgelegt)
     'org'  = eigener Eintrag der Firma
   Es werden NIE Werte erfunden — GEMA-Richtwerte sind als solche
   markiert und pro Firma übersteuerbar.

   Firmen-Erweiterungen: per-Record in der Cloud (moduleKey
   `lebensdauer`, prefix `ldkat:`, Pool `gema_ld_kat_pool_v1` —
   NUR GemaSync.saveRecord, NIE persistCollection: der Pool ist
   org-übergreifend, gelesen wird org-gefiltert). Ein Override
   eines Standard-Eintrags hat die deterministische Record-Id
   `ldo_<orgId>_<basisId>` (basisId-Muster wie die Prüfliste) —
   `deleted:true` blendet den Standard-Eintrag für die Firma aus,
   sonst gewinnen die Org-Felder. Eigene Einträge `ldn_…`.

   Konsumenten: pm_lebensdauer.html (Katalog + Schnellrechner),
   pm_machbarkeitsstudie.html (Materialwahl mit Auto-Lebensdauer).
   Engine im /*ENGINE-START*/ /*-Block ist DOM-frei (Node-Test:
   scripts/lebensdauer_engine_test.mjs).
   ============================================================ */
(function () {
  'use strict';

  /*ENGINE-START*/

  // ── Kategorien (Reihenfolge = Anzeige-Reihenfolge) ──────────
  var LD_KATEGORIEN = [
    { id: 'leitungen',     label: 'Leitungen & Rohre',                ic: '🚰' },
    { id: 'beschichtung',  label: 'Innenbeschichtung (Sanierung)',    ic: '🧪' },
    { id: 'warmwasser',    label: 'Warmwasseraufbereitung',           ic: '♨️' },
    { id: 'bad',           label: 'Bad / Dusche / WC',                ic: '🛁' },
    { id: 'kueche',        label: 'Küche',                            ic: '🍽️' },
    { id: 'heizung',       label: 'Heizung / Lüftung / Klima',        ic: '🔥' },
    { id: 'cheminee',      label: 'Cheminée',                         ic: '🪵' },
    { id: 'gebaeudehuelle',label: 'Gebäudehülle',                     ic: '🏠' },
    { id: 'waende',        label: 'Decken / Wände / Türen',           ic: '🚪' },
    { id: 'boeden',        label: 'Bodenbeläge',                      ic: '🔲' },
    { id: 'elektro',       label: 'Elektro / Empfang',                ic: '⚡' },
    { id: 'aussen',        label: 'Balkone / Storen / Umgebung',      ic: '🌤️' },
    { id: 'ausbau',        label: 'Ausbau / Aufzug',                  ic: '🛗' },
    { id: 'gemeinschaft',  label: 'Gemeinschaftseinrichtungen',       ic: '🧺' }
  ];

  // ── Nutzungsreduktion (Paritätische Tabelle: besondere Nutzung,
  //    insbesondere Boden-, Wand- und Deckenbeläge) ────────────
  var LD_NUTZUNGEN = [
    { id: 'wohnen',     label: 'Wohnen (Standard)',                        reduktionPct: 0 },
    { id: 'buero',      label: 'Büro',                                     reduktionPct: 20 },
    { id: 'laden',      label: 'Gewerbe, wenig Beanspruchung (Laden)',     reduktionPct: 25 },
    { id: 'restaurant', label: 'Gewerbe, viel Beanspruchung (Restaurant)', reduktionPct: 50 }
  ];

  // ── Quellen-Labels ─────────────────────────────────────────
  var LD_QUELLEN = {
    mv:   'Paritätische Lebensdauertabelle (MV/HEV)',
    mbs:  'Herstellerangabe Innenbeschichtung (S+P-Systemvergleich)',
    gema: 'GEMA-Richtwert',
    org:  'Eigener Eintrag'
  };

  // ── Ampel ──────────────────────────────────────────────────
  var LD_AMPEL = {
    gruen: { label: 'In Ordnung',                farbe: '#16a34a', bg: '#dcfce7' },
    gelb:  { label: 'Bald fällig',               farbe: '#d97706', bg: '#fef3c7' },
    rot:   { label: 'Lebensdauer überschritten', farbe: '#dc2626', bg: '#fee2e2' }
  };

  // ── Innenbeschichtungs-Systeme (S+P-Systemvergleich) ───────
  // Werte 1:1 aus der Vergleichstabelle der Machbarkeitsstudie —
  // Haltbarkeitsdauer «gemäss Hersteller», keine paritätischen Werte.
  var LD_BESCH_KRITERIEN = [
    { id: 'zulassung',          label: 'Zulassung SVGW und DVGW' },
    { id: 'tempKurz65',         label: 'Temperatur kurzfristig 65 °C' },
    { id: 'tempDauer65',        label: 'Temperatur dauerhaft über 65 °C' },
    { id: 'wasseranalyse',      label: 'Wasseranalyse bei Systemübergabe' },
    { id: 'farbGeruchlos',      label: 'Wasser farb-, geruch- und geschmacklos' },
    { id: 'wiederholung',       label: 'Wiederholung der Sanierung möglich' },
    { id: 'sanierbarVerzinkt',  label: 'Sanierbar: verzinkte Stahlrohre' },
    { id: 'sanierbarKupfer',    label: 'Sanierbar: Kupferrohre' },
    { id: 'sanierbarEdelstahl', label: 'Sanierbar: Edelstahlrohre' },
    { id: 'sanierbarKunststoff',label: 'Sanierbar: Kunststoffrohre' }
  ];
  var LD_BESCH_LEGENDE = {
    '+': 'Kriterium voll erfüllt',
    'o': 'Kriterium bedingt erfüllt',
    '-': 'Kriterium nicht erfüllt'
  };
  var LD_BESCHICHTUNGEN = [
    {
      id: 'promotec', name: 'Promotec', art: 'organisch', material: 'Epoxidharzbeschichtung',
      garantieJahre: 5, haltbarkeitJahre: 30,
      kriterien: { zulassung: '-', tempKurz65: '+', tempDauer65: '-', wasseranalyse: '+', farbGeruchlos: 'o', wiederholung: 'o', sanierbarVerzinkt: '+', sanierbarKupfer: '-', sanierbarEdelstahl: '-', sanierbarKunststoff: '-' },
      auswahlgrund: 'Das System Promotec (Epoxidharzbeschichtung) wird gewählt, da es für die Innensanierung von verzinkten Stahlleitungen geeignet ist und die grundlegenden technischen Anforderungen an eine Innenbeschichtung erfüllt.'
    },
    {
      id: 'anrosan', name: 'Anrosan', art: 'anorganisch', material: 'Zementbeschichtung',
      garantieJahre: 5, haltbarkeitJahre: 35,
      kriterien: { zulassung: '-', tempKurz65: '+', tempDauer65: '-', wasseranalyse: '+', farbGeruchlos: '+', wiederholung: '+', sanierbarVerzinkt: '+', sanierbarKupfer: '-', sanierbarEdelstahl: '-', sanierbarKunststoff: '-' },
      auswahlgrund: 'Das System Anrosan (Zementbeschichtung) wird gewählt, da es für die Sanierung von verzinkten Stahlleitungen geeignet ist und mehrere Anforderungen an Hygiene und Betriebssicherheit besonders gut erfüllt.'
    },
    {
      id: 'risan', name: 'Risan', art: 'organisch', material: 'Epoxidharzbeschichtung',
      garantieJahre: 10, haltbarkeitJahre: 10,
      kriterien: { zulassung: '-', tempKurz65: '+', tempDauer65: '+', wasseranalyse: '+', farbGeruchlos: '+', wiederholung: 'o', sanierbarVerzinkt: '+', sanierbarKupfer: '+', sanierbarEdelstahl: '+', sanierbarKunststoff: '-' },
      auswahlgrund: 'Das System Risan (Epoxidharzbeschichtung) wird gewählt, da es im Gegensatz zu den anderen geprüften Systemen sowohl verzinkte Stahlleitungen als auch Kupferleitungen mittels Innenbeschichtung sanieren kann. Dadurch können die vorhandenen Leitungsmaterialien innerhalb der Trinkwasserinstallation mit einem einheitlichen Verfahren instandgesetzt werden.'
    }
  ];

  // ── Standard-Katalog ───────────────────────────────────────
  // ids sind STABIL (Org-Overrides referenzieren sie via basisId) —
  // nie umbenennen, neue Einträge nur ANHÄNGEN.
  var LD_KATALOG = [

    // ═══ Leitungen & Rohre (Wasser / Gas / Abwasser / Heizung) ═══
    { id: 'lt_kw_stahl_verzinkt', kat: 'leitungen', gruppe: 'Wasserleitungen', name: 'Kaltwasserleitung Stahl verzinkt', jahre: 30, quelle: 'mv', tags: ['verzinkter stahl', 'verzinkt', 'wasserleitung', 'steigleitung'] },
    { id: 'lt_kw_chromstahl',     kat: 'leitungen', gruppe: 'Wasserleitungen', name: 'Wasserleitung Chromstahl (Chrom-Nickel-Stahl, CNS)', jahre: 50, quelle: 'mv', tags: ['cns', 'edelstahl', 'inox', 'presssystem', 'chromnickelstahl', 'steigleitung', 'verteilleitung'] },
    { id: 'lt_kw_kupfer',         kat: 'leitungen', gruppe: 'Wasserleitungen', name: 'Kaltwasserleitung Kupfer', jahre: 50, quelle: 'mv', tags: ['cu', 'wasserleitung'] },
    { id: 'lt_ww_kupfer',         kat: 'leitungen', gruppe: 'Wasserleitungen', name: 'Warmwasserleitung Kupfer (mit Dämmung)', jahre: 50, quelle: 'mv', tags: ['cu', 'warmwasser'] },
    { id: 'lt_pex_verbund',       kat: 'leitungen', gruppe: 'Wasserleitungen', name: 'Wasserleitung PEX-Metallverbundrohr', jahre: 30, quelle: 'mv', tags: ['pex', 'verbundrohr', 'kunststoff', 'stecksystem', 'anschlussleitung'] },
    { id: 'lt_gas_stahl',         kat: 'leitungen', gruppe: 'Gas', name: 'Gasleitung Stahlrohr, gestrichen', jahre: 50, quelle: 'mv', tags: ['erdgas'] },
    { id: 'lt_hz_metall',         kat: 'leitungen', gruppe: 'Heizung', name: 'Heizungsleitungen Kupfer / Stahl / Guss', jahre: 50, quelle: 'mv', tags: ['heizleitung'] },
    { id: 'lt_aw_guss',           kat: 'leitungen', gruppe: 'Abwasser', name: 'Abwasserleitung Guss (SML)', jahre: 50, quelle: 'gema', hinweis: 'GEMA-Richtwert — Abwasserleitungen sind in der paritätischen Tabelle nicht aufgeführt.', tags: ['fallleitung', 'schmutzwasser', 'gussrohr'] },
    { id: 'lt_aw_pe_silent',      kat: 'leitungen', gruppe: 'Abwasser', name: 'Abwasserleitung PE / PE Silent (schallgedämmt)', jahre: 50, quelle: 'gema', hinweis: 'GEMA-Richtwert — Abwasserleitungen sind in der paritätischen Tabelle nicht aufgeführt.', tags: ['fallleitung', 'polyethylen', 'geschweisst', 'schallschutz'] },

    // ═══ Innenbeschichtung (Sanierungssysteme, Herstellerangaben) ═══
    { id: 'be_promotec', kat: 'beschichtung', gruppe: 'Wasserleitungen', name: 'Innenbeschichtung Promotec (Epoxidharz)', jahre: 30, quelle: 'mbs', hinweis: 'Haltbarkeitsdauer gemäss Hersteller · Systemgarantie 5 Jahre ab Inbetriebnahme.', tags: ['sanierung', 'relining', 'epoxid'] },
    { id: 'be_anrosan',  kat: 'beschichtung', gruppe: 'Wasserleitungen', name: 'Innenbeschichtung Anrosan (Zement)', jahre: 35, quelle: 'mbs', hinweis: 'Haltbarkeitsdauer gemäss Hersteller · Systemgarantie 5 Jahre ab Inbetriebnahme.', tags: ['sanierung', 'relining', 'zementbeschichtung'] },
    { id: 'be_risan',    kat: 'beschichtung', gruppe: 'Wasserleitungen', name: 'Innenbeschichtung Risan (Epoxidharz)', jahre: 10, quelle: 'mbs', hinweis: 'Haltbarkeitsdauer gemäss Hersteller · Systemgarantie 10 Jahre ab Inbetriebnahme.', tags: ['sanierung', 'relining', 'epoxid'] },
    { id: 'be_inliner_abwasser', kat: 'beschichtung', gruppe: 'Abwasser', name: 'Inliner / Epoxidharz-Beschichtung Abwasserleitung', jahre: 30, quelle: 'gema', hinweis: 'GEMA-Richtwert für Zweikomponenten-Epoxidharz / Inlinerverfahren — massgebend ist die Herstellergarantie des gewählten Systems.', tags: ['sanierung', 'relining', 'spraypoxy', 'fallleitung'] },

    // ═══ Warmwasseraufbereitung ═══
    { id: 'ww_kombikessel',   kat: 'warmwasser', gruppe: 'Zentral', name: 'Kombi-Kessel', jahre: 20, quelle: 'mv' },
    { id: 'ww_umwaelzpumpe',  kat: 'warmwasser', gruppe: 'Zentral', name: 'Umwälzpumpe Warmwasser / Zirkulation', jahre: 20, quelle: 'mv', tags: ['zirkulationspumpe'] },
    { id: 'ww_elektro',       kat: 'warmwasser', gruppe: 'Zentral', name: 'Elektroinstallation Warmwasseranlage', jahre: 20, quelle: 'mv' },
    { id: 'ww_zaehler',       kat: 'warmwasser', gruppe: 'Zentral', name: 'Elektronische Zähler (Messinstrumente)', jahre: 15, quelle: 'mv', tags: ['wasserzaehler'] },
    { id: 'ww_kombiboiler',   kat: 'warmwasser', gruppe: 'Boiler', name: 'Kombiboiler (mit Heizung kombiniert)', jahre: 20, quelle: 'mv', tags: ['wassererwaermer', 'speicher'] },
    { id: 'ww_elektroboiler', kat: 'warmwasser', gruppe: 'Boiler', name: 'Elektroboiler', jahre: 20, quelle: 'mv', tags: ['wassererwaermer', 'speicher'] },
    { id: 'ww_gasapparate',   kat: 'warmwasser', gruppe: 'Boiler', name: 'Gasapparate Warmwasser', jahre: 20, quelle: 'mv' },
    { id: 'ww_einzelboiler',  kat: 'warmwasser', gruppe: 'Dezentral', name: 'Einzel-Warmwasserboiler', jahre: 15, quelle: 'mv', tags: ['boiler'] },
    { id: 'ww_durchlauferhitzer', kat: 'warmwasser', gruppe: 'Dezentral', name: 'Gasdurchlauferhitzer', jahre: 20, quelle: 'mv' },

    // ═══ Bad / Dusche / WC ═══
    { id: 'bd_wanne_acryl',    kat: 'bad', gruppe: 'Apparate', name: 'Badewanne / Duschwanne Acryl', jahre: 25, quelle: 'mv' },
    { id: 'bd_wanne_stahl',    kat: 'bad', gruppe: 'Apparate', name: 'Badewanne / Duschwanne Stahl, emailliert', jahre: 35, quelle: 'mv' },
    { id: 'bd_emaillierung',   kat: 'bad', gruppe: 'Apparate', name: 'Emaillierung Badewanne / Duschwanne (Reparatur)', jahre: 20, quelle: 'mv' },
    { id: 'bd_keramik',        kat: 'bad', gruppe: 'Apparate', name: 'Lavabo / WC / Bidet / Pissoir Keramik', jahre: 35, quelle: 'mv', tags: ['waschtisch', 'klosett'] },
    { id: 'bd_dusch_wc',       kat: 'bad', gruppe: 'Apparate', name: 'Dusch-WC', jahre: 20, quelle: 'mv', tags: ['closomat'] },
    { id: 'bd_spuelkasten_up', kat: 'bad', gruppe: 'Apparate', name: 'Spülkasten Unterputz', jahre: 40, quelle: 'mv' },
    { id: 'bd_spuelkasten_ap_kunststoff', kat: 'bad', gruppe: 'Apparate', name: 'Spülkasten Aufputz Kunststoff', jahre: 20, quelle: 'mv' },
    { id: 'bd_spuelkasten_ap_keramik',    kat: 'bad', gruppe: 'Apparate', name: 'Spülkasten Aufputz Keramik', jahre: 30, quelle: 'mv' },
    { id: 'bd_waschmaschine',  kat: 'bad', gruppe: 'Geräte', name: 'Waschmaschine (in der Wohnung)', jahre: 15, quelle: 'mv' },
    { id: 'bd_tumbler',        kat: 'bad', gruppe: 'Geräte', name: 'Tumbler (in der Wohnung)', jahre: 15, quelle: 'mv' },
    { id: 'bd_spiegelschrank_kunststoff', kat: 'bad', gruppe: 'Möbel', name: 'Spiegelschrank Kunststoff', jahre: 10, quelle: 'mv' },
    { id: 'bd_spiegelschrank_holz',       kat: 'bad', gruppe: 'Möbel', name: 'Spiegelschrank Holzwerkstoff', jahre: 10, quelle: 'mv' },
    { id: 'bd_spiegelschrank_metall',     kat: 'bad', gruppe: 'Möbel', name: 'Spiegelschrank Metall, einbrennlackiert', jahre: 25, quelle: 'mv' },
    { id: 'bd_spiegel',        kat: 'bad', gruppe: 'Möbel', name: 'Spiegel', jahre: 20, quelle: 'mv' },
    { id: 'bd_moebel_kunststoff', kat: 'bad', gruppe: 'Möbel', name: 'Badezimmermöbel Kunststoff', jahre: 10, quelle: 'mv' },
    { id: 'bd_moebel_holz',    kat: 'bad', gruppe: 'Möbel', name: 'Badezimmermöbel Holzwerkstoff', jahre: 10, quelle: 'mv' },
    { id: 'bd_moebel_metall',  kat: 'bad', gruppe: 'Möbel', name: 'Badezimmermöbel Metall, einbrennlackiert', jahre: 25, quelle: 'mv' },
    { id: 'bd_duschkabine_kunststoff', kat: 'bad', gruppe: 'Apparate', name: 'Duschkabine Kunststoff', jahre: 15, quelle: 'mv' },
    { id: 'bd_duschkabine_glas',       kat: 'bad', gruppe: 'Apparate', name: 'Duschkabine Glaswände', jahre: 25, quelle: 'mv', tags: ['duschtrennwand'] },
    { id: 'bd_mischbatterie',  kat: 'bad', gruppe: 'Armaturen', name: 'Mischbatterie, verchromt', jahre: 20, quelle: 'mv', tags: ['armatur', 'mischer'] },
    { id: 'bd_dichtungen',     kat: 'bad', gruppe: 'Armaturen', name: 'Packungen / Dichtungen Armaturen', jahre: 6, quelle: 'mv' },
    { id: 'bd_garnituren',     kat: 'bad', gruppe: 'Garnituren', name: 'Garnituren verchromt (Halter, Stangen, Tablar)', jahre: 15, quelle: 'mv', tags: ['seifenschale', 'handtuchhalter', 'glashalter'] },
    { id: 'bd_vorhangstange',  kat: 'bad', gruppe: 'Garnituren', name: 'Vorhangstange, verchromt', jahre: 10, quelle: 'mv' },
    { id: 'bd_wandplatten_keramik', kat: 'bad', gruppe: 'Wandbeläge', name: 'Wandplatten Bad Keramik / Steinzeug', jahre: 30, quelle: 'mv', tags: ['plaettli'] },
    { id: 'bd_wandplatten_feinsteinzeug', kat: 'bad', gruppe: 'Wandbeläge', name: 'Wandplatten Bad Feinsteinzeug', jahre: 40, quelle: 'mv', tags: ['plaettli'] },
    { id: 'bd_fugen',          kat: 'bad', gruppe: 'Wandbeläge', name: 'Fugendichtungen / Kittfugen Bad', jahre: 8, quelle: 'mv', tags: ['silikonfugen'] },
    { id: 'bd_modernisierung', kat: 'bad', gruppe: 'Gesamt', name: 'Badezimmermodernisierung, gesamthaft', jahre: 30, quelle: 'mv' },

    // ═══ Küche ═══
    { id: 'ku_kuehlschrank',   kat: 'kueche', gruppe: 'Geräte', name: 'Kühlschrank (mit Tiefkühlfach)', jahre: 10, quelle: 'mv' },
    { id: 'ku_tiefkuehler',    kat: 'kueche', gruppe: 'Geräte', name: 'Tiefkühltruhe / Tiefkühlschrank, freistehend', jahre: 15, quelle: 'mv' },
    { id: 'ku_gasherd',        kat: 'kueche', gruppe: 'Geräte', name: 'Gaseinbauherd mit Backofen', jahre: 15, quelle: 'mv' },
    { id: 'ku_glaskeramik',    kat: 'kueche', gruppe: 'Geräte', name: 'Glaskeramikkochfeld', jahre: 15, quelle: 'mv' },
    { id: 'ku_induktion',      kat: 'kueche', gruppe: 'Geräte', name: 'Induktionskochfeld', jahre: 15, quelle: 'mv' },
    { id: 'ku_kochherd',       kat: 'kueche', gruppe: 'Geräte', name: 'Kochherd und Backofen', jahre: 15, quelle: 'mv' },
    { id: 'ku_herdplatten',    kat: 'kueche', gruppe: 'Geräte', name: 'Herdplatten elektrisch, konventionell', jahre: 15, quelle: 'mv' },
    { id: 'ku_geschirrspueler',kat: 'kueche', gruppe: 'Geräte', name: 'Geschirrspüler', jahre: 15, quelle: 'mv', tags: ['abwaschmaschine'] },
    { id: 'ku_dampfabzug',     kat: 'kueche', gruppe: 'Geräte', name: 'Dampfabzug / Ventilator (inkl. Metallfilter)', jahre: 10, quelle: 'mv' },
    { id: 'ku_mikrowelle',     kat: 'kueche', gruppe: 'Geräte', name: 'Mikrowelle', jahre: 15, quelle: 'mv' },
    { id: 'ku_steamer',        kat: 'kueche', gruppe: 'Geräte', name: 'Steamer / Kombisteamer', jahre: 10, quelle: 'mv' },
    { id: 'ku_moebel_spanplatte', kat: 'kueche', gruppe: 'Möbel', name: 'Küchenmöbel Spanplatte / MDF', jahre: 15, quelle: 'mv' },
    { id: 'ku_moebel_metall',  kat: 'kueche', gruppe: 'Möbel', name: 'Küchenmöbel Metall, einbrennlackiert', jahre: 20, quelle: 'mv' },
    { id: 'ku_moebel_massiv',  kat: 'kueche', gruppe: 'Möbel', name: 'Küchenmöbel Massivholz', jahre: 20, quelle: 'mv' },
    { id: 'ku_abdeckung_chromstahl', kat: 'kueche', gruppe: 'Abdeckung', name: 'Küchenabdeckung Chromstahl', jahre: 25, quelle: 'mv' },
    { id: 'ku_abdeckung_granit',     kat: 'kueche', gruppe: 'Abdeckung', name: 'Küchenabdeckung Granit', jahre: 25, quelle: 'mv' },
    { id: 'ku_abdeckung_glas',       kat: 'kueche', gruppe: 'Abdeckung', name: 'Küchenabdeckung Glas', jahre: 25, quelle: 'mv' },
    { id: 'ku_abdeckung_kunstharz',  kat: 'kueche', gruppe: 'Abdeckung', name: 'Küchenabdeckung Kunstharz', jahre: 15, quelle: 'mv' },
    { id: 'ku_abdeckung_holz',       kat: 'kueche', gruppe: 'Abdeckung', name: 'Küchenabdeckung Holz massiv / Mehrschichtplatte', jahre: 20, quelle: 'mv' },
    { id: 'ku_armatur',        kat: 'kueche', gruppe: 'Armaturen', name: 'Bedienungsarmatur Küche', jahre: 20, quelle: 'mv', tags: ['mischer'] },
    { id: 'ku_lueftungsgitter',kat: 'kueche', gruppe: 'Diverses', name: 'Lüftungsgitter unten', jahre: 10, quelle: 'mv' },
    { id: 'ku_modern_tief',    kat: 'kueche', gruppe: 'Gesamt', name: 'Küchenmodernisierung, tiefe Qualität', jahre: 20, quelle: 'mv' },
    { id: 'ku_modern_hoch',    kat: 'kueche', gruppe: 'Gesamt', name: 'Küchenmodernisierung, hohe Qualität', jahre: 25, quelle: 'mv' },
    { id: 'ku_wandplatten_keramik', kat: 'kueche', gruppe: 'Wandbeläge', name: 'Wandplatten Küche Keramik / Steinzeug', jahre: 30, quelle: 'mv' },
    { id: 'ku_wandplatten_feinsteinzeug', kat: 'kueche', gruppe: 'Wandbeläge', name: 'Wandplatten Küche Feinsteinzeug', jahre: 40, quelle: 'mv' },
    { id: 'ku_kittfugen',      kat: 'kueche', gruppe: 'Wandbeläge', name: 'Fugendichtungen / Kittfugen Küche', jahre: 10, quelle: 'mv' },

    // ═══ Heizung / Lüftung / Klima ═══
    { id: 'hz_heizkessel',    kat: 'heizung', gruppe: 'Wärmeerzeugung', name: 'Heizkessel', jahre: 20, quelle: 'mv' },
    { id: 'hz_brenner',       kat: 'heizung', gruppe: 'Wärmeerzeugung', name: 'Brenner', jahre: 20, quelle: 'mv' },
    { id: 'hz_steuerung',     kat: 'heizung', gruppe: 'Wärmeerzeugung', name: 'Steuerung Heizung', jahre: 20, quelle: 'mv', tags: ['regelung'] },
    { id: 'hz_umwaelzpumpe',  kat: 'heizung', gruppe: 'Wärmeerzeugung', name: 'Umwälzpumpe Heizung', jahre: 20, quelle: 'mv' },
    { id: 'hz_kamin_chromstahl', kat: 'heizung', gruppe: 'Kamin', name: 'Kamin Chromstahl', jahre: 20, quelle: 'mv' },
    { id: 'hz_kamin_glaskeramik', kat: 'heizung', gruppe: 'Kamin', name: 'Kamin Glaskeramik', jahre: 20, quelle: 'mv' },
    { id: 'hz_waermepumpe',   kat: 'heizung', gruppe: 'Wärmeerzeugung', name: 'Wärmepumpe', jahre: 20, quelle: 'mv' },
    { id: 'hz_fernwaerme',    kat: 'heizung', gruppe: 'Wärmeerzeugung', name: 'Umformer Fernwärme (inkl. Anschluss)', jahre: 25, quelle: 'mv' },
    { id: 'hz_sonnenkollektoren', kat: 'heizung', gruppe: 'Wärmeerzeugung', name: 'Sonnenkollektoren', jahre: 20, quelle: 'mv', tags: ['solar'] },
    { id: 'hz_bodenheizung',  kat: 'heizung', gruppe: 'Wärmeabgabe', name: 'Bodenheizung', jahre: 30, quelle: 'mv', tags: ['fussbodenheizung'] },
    { id: 'hz_radiator',      kat: 'heizung', gruppe: 'Wärmeabgabe', name: 'Radiator', jahre: 50, quelle: 'mv', tags: ['heizkoerper'] },
    { id: 'hz_handtuchradiator', kat: 'heizung', gruppe: 'Wärmeabgabe', name: 'Handtuchradiator', jahre: 30, quelle: 'mv' },
    { id: 'hz_anstrich',      kat: 'heizung', gruppe: 'Wärmeabgabe', name: 'Kunstharzanstrich Leitungen / Radiatoren', jahre: 20, quelle: 'mv' },
    { id: 'hz_elektro',       kat: 'heizung', gruppe: 'Wärmeerzeugung', name: 'Elektroinstallation Heizanlage', jahre: 20, quelle: 'mv' },
    { id: 'hz_tank_innen',    kat: 'heizung', gruppe: 'Tankanlage', name: 'Öl- / Brennstofftank innenliegend', jahre: 30, quelle: 'mv' },
    { id: 'hz_tank_erdverlegt', kat: 'heizung', gruppe: 'Tankanlage', name: 'Öl- / Brennstofftank erdverlegt', jahre: 20, quelle: 'mv' },
    { id: 'hz_leckschutz',    kat: 'heizung', gruppe: 'Tankanlage', name: 'Leckschutzanlage', jahre: 20, quelle: 'mv' },
    { id: 'hz_waermezaehler', kat: 'heizung', gruppe: 'Messung', name: 'Wärme-, Mengen- und Durchflusszähler', jahre: 15, quelle: 'mv' },
    { id: 'hz_heizkostenverteiler', kat: 'heizung', gruppe: 'Messung', name: 'Heizkostenverteiler', jahre: 15, quelle: 'mv' },
    { id: 'hz_thermostatventil', kat: 'heizung', gruppe: 'Ventile', name: 'Thermostat-Radiatorventil', jahre: 20, quelle: 'mv' },
    { id: 'hz_radiatorventil',   kat: 'heizung', gruppe: 'Ventile', name: 'Gewöhnliches Radiatorenventil', jahre: 20, quelle: 'mv' },
    { id: 'hz_klimageraet',   kat: 'heizung', gruppe: 'Klima / Lüftung', name: 'Klimagerät (Einzelraum)', jahre: 15, quelle: 'mv' },
    { id: 'hz_wohnungslueftung', kat: 'heizung', gruppe: 'Klima / Lüftung', name: 'Kontrollierte Wohnungslüftung', jahre: 20, quelle: 'mv', tags: ['kwl', 'komfortlueftung'] },
    { id: 'hz_lueftungskanaele', kat: 'heizung', gruppe: 'Klima / Lüftung', name: 'Lüftungskanäle', jahre: 25, quelle: 'mv' },

    // ═══ Cheminée ═══
    { id: 'ch_cheminee',      kat: 'cheminee', gruppe: '', name: 'Cheminée / Cheminéeofen', jahre: 25, quelle: 'mv' },
    { id: 'ch_schamott',      kat: 'cheminee', gruppe: '', name: 'Schamottsteinauskleidung', jahre: 15, quelle: 'mv' },
    { id: 'ch_warmluft',      kat: 'cheminee', gruppe: '', name: 'Warmluft-Cheminée', jahre: 25, quelle: 'mv' },
    { id: 'ch_ventilator',    kat: 'cheminee', gruppe: '', name: 'Ventilator Rauchabzug', jahre: 20, quelle: 'mv' },
    { id: 'ch_aggregat_warmluft', kat: 'cheminee', gruppe: '', name: 'Aggregat für Warmluftcheminée', jahre: 20, quelle: 'mv' },
    { id: 'ch_aggregat_wrg',  kat: 'cheminee', gruppe: '', name: 'Aggregat zur Wärmerückgewinnung', jahre: 20, quelle: 'mv' },
    { id: 'ch_abschluss',     kat: 'cheminee', gruppe: '', name: 'Cheminéeabschluss (Metallgitter, Glas)', jahre: 20, quelle: 'mv' },

    // ═══ Gebäudehülle ═══
    { id: 'gh_styropor',      kat: 'gebaeudehuelle', gruppe: 'Isolation', name: 'Kompaktisolation Styropor', jahre: 25, quelle: 'mv', tags: ['fassadendaemmung'] },
    { id: 'gh_mineralwolle',  kat: 'gebaeudehuelle', gruppe: 'Isolation', name: 'Kompaktisolation Mineralwolldämmplatten', jahre: 30, quelle: 'mv', tags: ['fassadendaemmung'] },
    { id: 'gh_holzverkleidung', kat: 'gebaeudehuelle', gruppe: 'Fassade', name: 'Hinterlüftete Fassade Holzverkleidung', jahre: 30, quelle: 'mv' },
    { id: 'gh_platten',       kat: 'gebaeudehuelle', gruppe: 'Fassade', name: 'Hinterlüftete Fassade Platten', jahre: 30, quelle: 'mv' },
    { id: 'gh_eternit',       kat: 'gebaeudehuelle', gruppe: 'Fassade', name: 'Eternitverkleidung / -schindeln', jahre: 40, quelle: 'mv' },
    { id: 'gh_mineralputz',   kat: 'gebaeudehuelle', gruppe: 'Verputz', name: 'Mineralischer Fassadenputz', jahre: 40, quelle: 'mv' },
    { id: 'gh_kunststoffputz',kat: 'gebaeudehuelle', gruppe: 'Verputz', name: 'Kunststoffputz Fassade', jahre: 25, quelle: 'mv' },
    { id: 'gh_silikat',       kat: 'gebaeudehuelle', gruppe: 'Verputz', name: 'Silikatanstrich (rein mineralisch)', jahre: 25, quelle: 'mv' },
    { id: 'gh_dispersion',    kat: 'gebaeudehuelle', gruppe: 'Verputz', name: 'Dispersionsfarbe aussen', jahre: 20, quelle: 'mv' },
    { id: 'gh_dachisolation', kat: 'gebaeudehuelle', gruppe: 'Isolation', name: 'Estrich- / Keller- / Dachisolation', jahre: 30, quelle: 'mv' },
    { id: 'gh_fensterbaenke', kat: 'gebaeudehuelle', gruppe: 'Fenster', name: 'Fensterbänke (Anpassung an Isolation)', jahre: 30, quelle: 'mv' },
    { id: 'gh_kittfugen',     kat: 'gebaeudehuelle', gruppe: 'Fenster', name: 'Fugendichtungen / Kittfugen aussen, elastisch', jahre: 10, quelle: 'mv' },
    { id: 'gh_dv_fenster',    kat: 'gebaeudehuelle', gruppe: 'Fenster', name: 'DV-Fenster Holz (Doppelverglasung)', jahre: 25, quelle: 'mv' },
    { id: 'gh_iv_kunststoff', kat: 'gebaeudehuelle', gruppe: 'Fenster', name: 'IV-Fenster Kunststoff', jahre: 25, quelle: 'mv', tags: ['isolierverglasung'] },
    { id: 'gh_iv_holz',       kat: 'gebaeudehuelle', gruppe: 'Fenster', name: 'IV-Fenster Holz', jahre: 25, quelle: 'mv', tags: ['isolierverglasung'] },
    { id: 'gh_iv_holzmetall', kat: 'gebaeudehuelle', gruppe: 'Fenster', name: 'IV-Fenster Holz-Metall', jahre: 25, quelle: 'mv', tags: ['isolierverglasung'] },
    { id: 'gh_iv_metall',     kat: 'gebaeudehuelle', gruppe: 'Fenster', name: 'IV-Fenster Metall', jahre: 30, quelle: 'mv', tags: ['isolierverglasung'] },
    { id: 'gh_fensteranstrich', kat: 'gebaeudehuelle', gruppe: 'Fenster', name: 'Beschichtung Fenster / Fensterbänke (Öl, Kunstharz, Acryl)', jahre: 10, quelle: 'mv' },
    { id: 'gh_gummidichtungen', kat: 'gebaeudehuelle', gruppe: 'Fenster', name: 'Gummidichtungen zu Fenstern', jahre: 10, quelle: 'mv' },
    { id: 'gh_rollladen_holz',  kat: 'gebaeudehuelle', gruppe: 'Storen', name: 'Rollladen Holz', jahre: 25, quelle: 'mv' },
    { id: 'gh_rollladen_metall',kat: 'gebaeudehuelle', gruppe: 'Storen', name: 'Rollladen Metall / Aluminium', jahre: 30, quelle: 'mv' },
    { id: 'gh_lamellen_aussen', kat: 'gebaeudehuelle', gruppe: 'Storen', name: 'Lamellenstoren aussen, Aluminium', jahre: 25, quelle: 'mv', tags: ['rafflamellen'] },
    { id: 'gh_lamellen_innen',  kat: 'gebaeudehuelle', gruppe: 'Storen', name: 'Lamellenstoren innen', jahre: 15, quelle: 'mv' },
    { id: 'gh_gurten',        kat: 'gebaeudehuelle', gruppe: 'Storen', name: 'Gurten für Rollladen und Storen', jahre: 8, quelle: 'mv' },
    { id: 'gh_storenmotor',   kat: 'gebaeudehuelle', gruppe: 'Storen', name: 'Motor für Storen / Rollladen', jahre: 15, quelle: 'mv' },
    { id: 'gh_kurbel',        kat: 'gebaeudehuelle', gruppe: 'Storen', name: 'Kurbel', jahre: 15, quelle: 'mv' },
    { id: 'gh_kurbelhalterung_metall',     kat: 'gebaeudehuelle', gruppe: 'Storen', name: 'Kurbel-Halterung Metall', jahre: 10, quelle: 'mv' },
    { id: 'gh_kurbelhalterung_kunststoff', kat: 'gebaeudehuelle', gruppe: 'Storen', name: 'Kurbel-Halterung Kunststoff', jahre: 5, quelle: 'mv' },
    { id: 'gh_jalousie_holz', kat: 'gebaeudehuelle', gruppe: 'Storen', name: 'Jalousieladen Holz', jahre: 30, quelle: 'mv', tags: ['fensterladen'] },
    { id: 'gh_jalousie_anstrich', kat: 'gebaeudehuelle', gruppe: 'Storen', name: 'Jalousieladen Holz, neuer Anstrich', jahre: 15, quelle: 'mv' },
    { id: 'gh_jalousie_metall', kat: 'gebaeudehuelle', gruppe: 'Storen', name: 'Jalousieladen Metall / Aluminium', jahre: 40, quelle: 'mv', tags: ['fensterladen'] },
    { id: 'gh_kiesklebedach', kat: 'gebaeudehuelle', gruppe: 'Dach', name: 'Flachdach Kiesklebedach', jahre: 30, quelle: 'mv' },
    { id: 'gh_zementplatten_dach', kat: 'gebaeudehuelle', gruppe: 'Dach', name: 'Flachdach Zementplattenbelag', jahre: 30, quelle: 'mv' },
    { id: 'gh_schraegdach',   kat: 'gebaeudehuelle', gruppe: 'Dach', name: 'Schrägdach Ziegel / Eternit', jahre: 50, quelle: 'mv' },
    { id: 'gh_rinne_verzinkt',kat: 'gebaeudehuelle', gruppe: 'Spenglerei', name: 'Dachrinne / Fallrohr gestrichen oder verzinkt', jahre: 20, quelle: 'mv' },
    { id: 'gh_rinne_kupfer',  kat: 'gebaeudehuelle', gruppe: 'Spenglerei', name: 'Dachrinne / Fallrohr Kupfer-Titan-Zink', jahre: 30, quelle: 'mv' },
    { id: 'gh_rinne_chromstahl', kat: 'gebaeudehuelle', gruppe: 'Spenglerei', name: 'Dachrinne / Fallrohr Chromstahl / Uginox / Kupfer', jahre: 40, quelle: 'mv' },
    { id: 'gh_vordach',       kat: 'gebaeudehuelle', gruppe: 'Dach', name: 'Vordach Konstruktion Metall / Holz', jahre: 30, quelle: 'mv' },
    { id: 'gh_vordach_glas',  kat: 'gebaeudehuelle', gruppe: 'Dach', name: 'Vordach Eindeckung Glas', jahre: 30, quelle: 'mv' },
    { id: 'gh_vordach_ziegel',kat: 'gebaeudehuelle', gruppe: 'Dach', name: 'Vordach Eindeckung Ziegel / Blech', jahre: 40, quelle: 'mv' },

    // ═══ Decken / Wände / Türen ═══
    { id: 'wt_tapete_mittel', kat: 'waende', gruppe: 'Tapeten / Anstriche', name: 'Tapeten mittlere Qualität (Raufaser)', jahre: 10, quelle: 'mv' },
    { id: 'wt_tapete_gut',    kat: 'waende', gruppe: 'Tapeten / Anstriche', name: 'Tapeten gute Qualität, abwaschbar', jahre: 15, quelle: 'mv' },
    { id: 'wt_glasfasertapete', kat: 'waende', gruppe: 'Tapeten / Anstriche', name: 'Glasfasertapete, streichbar', jahre: 20, quelle: 'mv' },
    { id: 'wt_dispersion',    kat: 'waende', gruppe: 'Tapeten / Anstriche', name: 'Dispersions- / Leimfarbe innen', jahre: 8, quelle: 'mv', tags: ['wandanstrich'] },
    { id: 'wt_acryl',         kat: 'waende', gruppe: 'Tapeten / Anstriche', name: 'Acryl- / Alkydharz- / Kunstharzfarbe innen', jahre: 15, quelle: 'mv' },
    { id: 'wt_kunststoffabrieb', kat: 'waende', gruppe: 'Putze', name: 'Kunststoffabrieb', jahre: 30, quelle: 'mv' },
    { id: 'wt_abrieb_mineralisch', kat: 'waende', gruppe: 'Putze', name: 'Abrieb mineralisch (rohe Putze, Klosterputz)', jahre: 25, quelle: 'mv' },
    { id: 'wt_weissputz',     kat: 'waende', gruppe: 'Putze', name: 'Weissputz', jahre: 20, quelle: 'mv' },
    { id: 'wt_taefer_roh',    kat: 'waende', gruppe: 'Täfer / Decken', name: 'Holztäfer roh (Verkleidung)', jahre: 30, quelle: 'mv' },
    { id: 'wt_taefer_lasiert',kat: 'waende', gruppe: 'Täfer / Decken', name: 'Holztäfer lasiert', jahre: 20, quelle: 'mv' },
    { id: 'wt_taefer_gestrichen', kat: 'waende', gruppe: 'Täfer / Decken', name: 'Holztäfer deckend gestrichen', jahre: 30, quelle: 'mv' },
    { id: 'wt_taefer_anstrich', kat: 'waende', gruppe: 'Täfer / Decken', name: 'Lasur / Deckfarbe auf Holztäfer', jahre: 20, quelle: 'mv' },
    { id: 'wt_decke_metall',  kat: 'waende', gruppe: 'Täfer / Decken', name: 'Decke abgehängt Metall (inkl. Einbauleuchten)', jahre: 20, quelle: 'mv' },
    { id: 'wt_decke_holz',    kat: 'waende', gruppe: 'Täfer / Decken', name: 'Holz- / Täferdecke', jahre: 40, quelle: 'mv' },
    { id: 'wt_trennwand',     kat: 'waende', gruppe: 'Wände', name: 'Mobile Leichtbau-Trennwand', jahre: 30, quelle: 'mv' },
    { id: 'wt_schrank_spanplatte', kat: 'waende', gruppe: 'Einbauschränke', name: 'Einbauschrank Spanplatte', jahre: 20, quelle: 'mv' },
    { id: 'wt_schrank_massiv',kat: 'waende', gruppe: 'Einbauschränke', name: 'Einbauschrank Massivholz', jahre: 35, quelle: 'mv' },
    { id: 'wt_schrank_beschlaege', kat: 'waende', gruppe: 'Einbauschränke', name: 'Beschläge Einbauschränke', jahre: 15, quelle: 'mv' },
    { id: 'wt_schrank_anstrich', kat: 'waende', gruppe: 'Einbauschränke', name: 'Öl- / Kunstharzanstrich Schränke', jahre: 20, quelle: 'mv' },
    { id: 'wt_tuer_massiv',   kat: 'waende', gruppe: 'Türen', name: 'Türe Massivholz', jahre: 30, quelle: 'mv' },
    { id: 'wt_tuer_pressspan',kat: 'waende', gruppe: 'Türen', name: 'Türe Holzwerkstoff / Pressspan', jahre: 25, quelle: 'mv' },
    { id: 'wt_tuer_metall',   kat: 'waende', gruppe: 'Türen', name: 'Türe Metall', jahre: 30, quelle: 'mv' },
    { id: 'wt_tuer_anstrich', kat: 'waende', gruppe: 'Türen', name: 'Öl- / Kunstharzanstrich Türen und Rahmen', jahre: 20, quelle: 'mv' },
    { id: 'wt_tuer_glas',     kat: 'waende', gruppe: 'Türen', name: 'Glaseinsatz zu Türen', jahre: 30, quelle: 'mv' },
    { id: 'wt_tuer_beschlaege', kat: 'waende', gruppe: 'Türen', name: 'Beschläge zu Türen', jahre: 15, quelle: 'mv' },
    { id: 'wt_tuer_dichtung', kat: 'waende', gruppe: 'Türen', name: 'Gummidichtungen zu Türen', jahre: 15, quelle: 'mv' },
    { id: 'wt_schiebetuere',  kat: 'waende', gruppe: 'Türen', name: 'Schiebetüre / Faltwand', jahre: 30, quelle: 'mv' },
    { id: 'wt_schiebetuere_rollen', kat: 'waende', gruppe: 'Türen', name: 'Rollen zu Schiebetüren', jahre: 15, quelle: 'mv' },
    { id: 'wt_rahmen_holz',   kat: 'waende', gruppe: 'Türen', name: 'Türrahmen und Schwellen Holz', jahre: 30, quelle: 'mv' },
    { id: 'wt_rahmen_metall', kat: 'waende', gruppe: 'Türen', name: 'Türrahmen und Schwellen Metall / Stein', jahre: 40, quelle: 'mv' },
    { id: 'wt_zargen',        kat: 'waende', gruppe: 'Türen', name: 'Zargen Metall', jahre: 30, quelle: 'mv' },
    { id: 'wt_fenstersims',   kat: 'waende', gruppe: 'Diverses', name: 'Fenstersims innen, lackiert', jahre: 20, quelle: 'mv' },
    { id: 'wt_schloss_wohnung', kat: 'waende', gruppe: 'Schlösser', name: 'Schloss Wohnungstüre', jahre: 30, quelle: 'mv' },
    { id: 'wt_schloss_zimmer',  kat: 'waende', gruppe: 'Schlösser', name: 'Schloss Zimmertüre', jahre: 30, quelle: 'mv' },
    { id: 'wt_kittfugen',     kat: 'waende', gruppe: 'Diverses', name: 'Kittfugen innen', jahre: 10, quelle: 'mv' },
    { id: 'wt_schliessanlage',kat: 'waende', gruppe: 'Schlösser', name: 'Schliessanlage, automatisch', jahre: 20, quelle: 'mv' },

    // ═══ Bodenbeläge ═══
    { id: 'bo_pvc',           kat: 'boeden', gruppe: 'Beläge', name: 'PVC / Novilon', jahre: 20, quelle: 'mv' },
    { id: 'bo_gummi',         kat: 'boeden', gruppe: 'Beläge', name: 'Gummi / Kautschuk', jahre: 20, quelle: 'mv' },
    { id: 'bo_linoleum',      kat: 'boeden', gruppe: 'Beläge', name: 'Linoleum', jahre: 20, quelle: 'mv' },
    { id: 'bo_kork',          kat: 'boeden', gruppe: 'Beläge', name: 'Korkboden versiegelt', jahre: 15, quelle: 'mv' },
    { id: 'bo_laminat31',     kat: 'boeden', gruppe: 'Laminat', name: 'Laminat Klasse 31 (einfache Qualität)', jahre: 10, quelle: 'mv' },
    { id: 'bo_laminat32',     kat: 'boeden', gruppe: 'Laminat', name: 'Laminat Klasse 32 (mittlere Qualität)', jahre: 15, quelle: 'mv' },
    { id: 'bo_laminat33',     kat: 'boeden', gruppe: 'Laminat', name: 'Laminat Klasse 33 (gehobene Qualität)', jahre: 25, quelle: 'mv' },
    { id: 'bo_klebeparkett',  kat: 'boeden', gruppe: 'Parkett', name: 'Klebeparkett (kleinformatiges Massivholzparkett)', jahre: 40, quelle: 'mv' },
    { id: 'bo_massivparkett', kat: 'boeden', gruppe: 'Parkett', name: 'Hartholzriemen / Massivparkett', jahre: 40, quelle: 'mv' },
    { id: 'bo_mehrschichtparkett', kat: 'boeden', gruppe: 'Parkett', name: 'Weichholzriemen / Mehrschichtparkett', jahre: 30, quelle: 'mv' },
    { id: 'bo_fournierparkett', kat: 'boeden', gruppe: 'Parkett', name: 'Fournierparkett (dünne Holzdecklamelle)', jahre: 12, quelle: 'mv' },
    { id: 'bo_versiegelung',  kat: 'boeden', gruppe: 'Parkett', name: 'Parkett-Versiegelung / -Ölung', jahre: 10, quelle: 'mv' },
    { id: 'bo_unterlagsboden',kat: 'boeden', gruppe: 'Unterbau', name: 'Unterlagen für Bodenbeläge (Anhydrid etc.)', jahre: 40, quelle: 'mv', tags: ['unterlagsboden'] },
    { id: 'bo_installationsboden', kat: 'boeden', gruppe: 'Unterbau', name: 'Installationsböden', jahre: 40, quelle: 'mv', tags: ['doppelboden'] },
    { id: 'bo_tonplatten',    kat: 'boeden', gruppe: 'Platten', name: 'Tonplatten', jahre: 30, quelle: 'mv' },
    { id: 'bo_naturstein_weich', kat: 'boeden', gruppe: 'Platten', name: 'Naturstein weich (Gneis, Schiefer, Marmor)', jahre: 30, quelle: 'mv' },
    { id: 'bo_naturstein_hart',  kat: 'boeden', gruppe: 'Platten', name: 'Naturstein hart (Granit, Quarz)', jahre: 40, quelle: 'mv' },
    { id: 'bo_keramik',       kat: 'boeden', gruppe: 'Platten', name: 'Keramikplatten Boden, lasiert', jahre: 30, quelle: 'mv', tags: ['plaettli'] },
    { id: 'bo_feinsteinzeug', kat: 'boeden', gruppe: 'Platten', name: 'Feinsteinzeugplatten Boden, durchgefärbt', jahre: 40, quelle: 'mv', tags: ['plaettli'] },
    { id: 'bo_kunststein',    kat: 'boeden', gruppe: 'Platten', name: 'Kunststeinplatten', jahre: 40, quelle: 'mv' },
    { id: 'bo_naturfaser',    kat: 'boeden', gruppe: 'Teppiche', name: 'Naturfaserteppich (Sisal, Kokos)', jahre: 10, quelle: 'mv' },
    { id: 'bo_kugelgarn',     kat: 'boeden', gruppe: 'Teppiche', name: 'Kugelgarn', jahre: 8, quelle: 'mv' },
    { id: 'bo_nadelfilz',     kat: 'boeden', gruppe: 'Teppiche', name: 'Nadelfilz', jahre: 8, quelle: 'mv' },
    { id: 'bo_spannteppich',  kat: 'boeden', gruppe: 'Teppiche', name: 'Spannteppich mittlere Qualität', jahre: 10, quelle: 'mv' },
    { id: 'bo_sockel_kunststoff', kat: 'boeden', gruppe: 'Sockelleisten', name: 'Sockelleisten Kunststoff / furniert', jahre: 15, quelle: 'mv' },
    { id: 'bo_sockel_holz',   kat: 'boeden', gruppe: 'Sockelleisten', name: 'Sockelleisten Buchen- / Eichenholz', jahre: 25, quelle: 'mv' },
    { id: 'bo_kittfugen',     kat: 'boeden', gruppe: 'Diverses', name: 'Kittfugen Boden', jahre: 10, quelle: 'mv' },

    // ═══ Elektro / Empfang ═══
    { id: 'el_tv_kabel',      kat: 'elektro', gruppe: 'Empfang', name: 'TV-Kabelanschluss', jahre: 10, quelle: 'mv' },
    { id: 'el_isdn',          kat: 'elektro', gruppe: 'Empfang', name: 'ISDN-Anschluss', jahre: 10, quelle: 'mv' },
    { id: 'el_antenne',       kat: 'elektro', gruppe: 'Empfang', name: 'TV-Antenne / Satellitenschüssel', jahre: 10, quelle: 'mv' },
    { id: 'el_telefonverteiler', kat: 'elektro', gruppe: 'Empfang', name: 'Telefonverteiler, Installationen', jahre: 25, quelle: 'mv' },
    { id: 'el_telefonzentrale', kat: 'elektro', gruppe: 'Empfang', name: 'Telefonhauszentrale, Kleinzentrale', jahre: 15, quelle: 'mv' },
    { id: 'el_schalter',      kat: 'elektro', gruppe: 'Installationen', name: 'Schalter', jahre: 15, quelle: 'mv' },
    { id: 'el_steckdosen',    kat: 'elektro', gruppe: 'Installationen', name: 'Steckdosen', jahre: 15, quelle: 'mv' },
    { id: 'el_fassungen',     kat: 'elektro', gruppe: 'Installationen', name: 'Fassungen', jahre: 15, quelle: 'mv' },
    { id: 'el_zaehler',       kat: 'elektro', gruppe: 'Installationen', name: 'Elektrozähler', jahre: 20, quelle: 'mv' },
    { id: 'el_leuchten',      kat: 'elektro', gruppe: 'Installationen', name: 'Leuchten (Küche, Bad, WC)', jahre: 20, quelle: 'mv' },
    { id: 'el_leitungen',     kat: 'elektro', gruppe: 'Installationen', name: 'Elektroleitungen', jahre: 40, quelle: 'mv' },
    { id: 'el_starkstrom',    kat: 'elektro', gruppe: 'Installationen', name: 'Starkstromanlagen', jahre: 40, quelle: 'mv' },

    // ═══ Balkone / Sonnenstoren / Wintergarten / Umgebung ═══
    { id: 'au_balkon_holz',   kat: 'aussen', gruppe: 'Balkone', name: 'Balkon Holzkonstruktion', jahre: 30, quelle: 'mv' },
    { id: 'au_balkon_metall', kat: 'aussen', gruppe: 'Balkone', name: 'Balkon Metallkonstruktion', jahre: 40, quelle: 'mv' },
    { id: 'au_balkon_zementplatten', kat: 'aussen', gruppe: 'Balkone', name: 'Balkon Zementplatten', jahre: 30, quelle: 'mv' },
    { id: 'au_balkon_feinsteinzeug', kat: 'aussen', gruppe: 'Balkone', name: 'Balkon Feinsteinzeugplatten', jahre: 25, quelle: 'mv' },
    { id: 'au_gelaender_holz',   kat: 'aussen', gruppe: 'Balkone', name: 'Geländer Holzlatten, gestrichen', jahre: 20, quelle: 'mv' },
    { id: 'au_gelaender_metall', kat: 'aussen', gruppe: 'Balkone', name: 'Geländer Metall, gestrichen / einbrennlackiert', jahre: 30, quelle: 'mv' },
    { id: 'au_sonnenstore',   kat: 'aussen', gruppe: 'Storen', name: 'Sonnenstore Stoff', jahre: 15, quelle: 'mv' },
    { id: 'au_storengurten',  kat: 'aussen', gruppe: 'Storen', name: 'Gurten für Sonnenstoren', jahre: 8, quelle: 'mv' },
    { id: 'au_wintergarten_holz',  kat: 'aussen', gruppe: 'Wintergarten', name: 'Wintergarten Holz / Kunststoff, verglast', jahre: 20, quelle: 'mv' },
    { id: 'au_wintergarten_stahl', kat: 'aussen', gruppe: 'Wintergarten', name: 'Wintergarten Stahl, verglast', jahre: 25, quelle: 'mv' },
    { id: 'au_wintergarten_alu',   kat: 'aussen', gruppe: 'Wintergarten', name: 'Wintergarten Aluminium / verzinkter Stahl, verglast', jahre: 30, quelle: 'mv' },
    { id: 'au_isolierverglasung',  kat: 'aussen', gruppe: 'Wintergarten', name: 'Isolierverglasung Wintergarten', jahre: 25, quelle: 'mv' },
    { id: 'au_terrasse_zementplatten', kat: 'aussen', gruppe: 'Terrassen', name: 'Terrasse Zementplatten', jahre: 30, quelle: 'mv' },
    { id: 'au_spielgeraete',  kat: 'aussen', gruppe: 'Umgebung', name: 'Spielgeräte (Metall, Holz, Kunststoff)', jahre: 15, quelle: 'mv' },
    { id: 'au_fussmatten',    kat: 'aussen', gruppe: 'Umgebung', name: 'Fussmatten / Schmutzschleusen, textil', jahre: 10, quelle: 'mv' },

    // ═══ Keller- / Estrichausbau & Aufzug ═══
    { id: 'ab_kellerausbau',  kat: 'ausbau', gruppe: 'Ausbau', name: 'Keller- / Estrichausbau', jahre: 40, quelle: 'mv' },
    { id: 'ab_schutzraum',    kat: 'ausbau', gruppe: 'Ausbau', name: 'Schutzraumbelüftung', jahre: 40, quelle: 'mv' },
    { id: 'ab_lift',          kat: 'ausbau', gruppe: 'Aufzug', name: 'Liftanlage', jahre: 30, quelle: 'mv', tags: ['aufzug'] },
    { id: 'ab_lift_elektro',  kat: 'ausbau', gruppe: 'Aufzug', name: 'Elektroinstallation Liftanlage', jahre: 30, quelle: 'mv' },

    // ═══ Gemeinschaftseinrichtungen ═══
    { id: 'ge_waschmaschine', kat: 'gemeinschaft', gruppe: 'Waschküche', name: 'Waschmaschine (Gemeinschaft)', jahre: 15, quelle: 'mv' },
    { id: 'ge_tumbler',       kat: 'gemeinschaft', gruppe: 'Waschküche', name: 'Tumbler (Gemeinschaft)', jahre: 15, quelle: 'mv' },
    { id: 'ge_trockenapparat',kat: 'gemeinschaft', gruppe: 'Waschküche', name: 'Trockenapparat / Raumluft-Wäschetrockner', jahre: 15, quelle: 'mv', tags: ['secomat'] },
    { id: 'ge_enthaertung',   kat: 'gemeinschaft', gruppe: 'Technik', name: 'Wasserenthärtungsanlage', jahre: 20, quelle: 'mv', tags: ['ionenaustauscher'] },
    { id: 'ge_schliessanlage',kat: 'gemeinschaft', gruppe: 'Technik', name: 'Kombischliessanlage', jahre: 20, quelle: 'mv' },
    { id: 'ge_tueroeffner',   kat: 'gemeinschaft', gruppe: 'Technik', name: 'Automatische Türöffner-Anlage', jahre: 20, quelle: 'mv' },
    { id: 'ge_gegensprech',   kat: 'gemeinschaft', gruppe: 'Technik', name: 'Gegensprechanlage / Türöffner, elektrisch', jahre: 20, quelle: 'mv' },
    { id: 'ge_briefkasten',   kat: 'gemeinschaft', gruppe: 'Technik', name: 'Briefkasten', jahre: 20, quelle: 'mv' },
    { id: 'ge_zaun_holz',     kat: 'gemeinschaft', gruppe: 'Umgebung', name: 'Zaun Metallpfosten mit Holzstaketen', jahre: 15, quelle: 'mv' },
    { id: 'ge_zaun_metall',   kat: 'gemeinschaft', gruppe: 'Umgebung', name: 'Zaun Metallpfosten mit Metallstaketen / Draht', jahre: 25, quelle: 'mv' },
    { id: 'ge_mauern',        kat: 'gemeinschaft', gruppe: 'Umgebung', name: 'Garten- / Garagen- / Geländemauern, massiv', jahre: 40, quelle: 'mv' },
    { id: 'ge_zugangswege',   kat: 'gemeinschaft', gruppe: 'Umgebung', name: 'Zementplatten Zugangswege', jahre: 30, quelle: 'mv' }
  ];

  // ── Text-Normalisierung für die Suche (Umlaut-Faltung) ─────
  function ldNorm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
      .replace(/[éèê]/g, 'e').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  // ── Suche über eine Liste (alle Suchwörter müssen treffen) ─
  function ldSucheIn(liste, q) {
    var nq = ldNorm(q);
    if (!nq) return liste.slice();
    var teile = nq.split(' ');
    return liste.filter(function (e) {
      var hay = ldNorm((e.name || '') + ' ' + (e.gruppe || '') + ' ' + (e.kat || '') + ' ' + (e.tags || []).join(' '));
      return teile.every(function (t) { return hay.indexOf(t) >= 0; });
    });
  }

  // ── Nutzungsreduktion anwenden ─────────────────────────────
  // Reduktion der Lebensdauer bei besonderer Nutzung (Büro 20 % /
  // Laden 25 % / Restaurant 50 %) — mind. 1 Jahr bleibt.
  function ldReduktion(jahre, nutzungId) {
    var j = Number(jahre);
    if (!isFinite(j) || j <= 0) return null;
    var n = null;
    for (var i = 0; i < LD_NUTZUNGEN.length; i++) { if (LD_NUTZUNGEN[i].id === nutzungId) { n = LD_NUTZUNGEN[i]; break; } }
    var pct = n ? n.reduktionPct : 0;
    return Math.max(1, Math.round(j * (1 - pct / 100)));
  }

  // ── Ampel aus Restlebensdauer ──────────────────────────────
  // rot  = Lebensdauer überschritten (rest <= 0)
  // gelb = bald fällig (rest <= 20 % der Lebensdauer, mind. 2 Jahre)
  // grün = in Ordnung
  function ldAmpel(rest, jahre) {
    if (!isFinite(rest) || !isFinite(jahre) || jahre <= 0) return null;
    if (rest <= 0) return 'rot';
    if (rest <= Math.max(2, jahre * 0.2)) return 'gelb';
    return 'gruen';
  }

  // ── Kern-Berechnung ────────────────────────────────────────
  // Einbaujahr + Lebensdauer → theoretisches Lebensende, Alter,
  // Restlebensdauer, Anteil verbraucht, Ampel.
  // Beispiel: ldBerechne(1995, 50, 2026) →
  //   { lebensende: 2045, alter: 31, rest: 19, verbrauchtPct: 62, ampel: 'gruen' }
  function ldBerechne(einbaujahr, jahre, heute) {
    var ej = parseInt(einbaujahr, 10);
    var j = Number(jahre);
    if (!isFinite(ej) || ej < 1800 || ej > 2200) return null;
    if (!isFinite(j) || j <= 0) return null;
    var now = (heute == null)
      ? new Date().getFullYear()
      : parseInt(heute, 10);
    if (!isFinite(now)) return null;
    var lebensende = ej + Math.round(j);
    var alter = now - ej; if (alter < 0) alter = 0;
    var rest = lebensende - now;
    var verbrauchtPct = Math.round(alter / j * 100);
    return {
      einbaujahr: ej,
      jahre: Math.round(j),
      lebensende: lebensende,
      alter: alter,
      rest: rest,
      verbrauchtPct: verbrauchtPct,
      ampel: ldAmpel(rest, j)
    };
  }

  // ── Wirksamer Katalog: Standard + Org-Records (PURE) ───────
  // orgRecords: [{id:'ldo_<org>_<basisId>'|'ldn_…', basisId?, deleted?,
  //              name?, jahre?, hinweis?, kat?, gruppe?, tags?}]
  // Regeln: basisId-Record ÜBERSTEUERT den Standard-Eintrag
  // (deleted:true blendet ihn aus, sonst gewinnen die Org-Felder);
  // Records ohne basisId sind eigene Einträge und werden angehängt.
  function ldEffektiv(defaults, orgRecords) {
    var byBasis = {};
    var eigene = [];
    (orgRecords || []).forEach(function (r) {
      if (!r || !r.id) return;
      if (r.basisId) { byBasis[r.basisId] = r; return; }
      if (r.deleted) return;
      eigene.push(r);
    });
    var out = [];
    (defaults || []).forEach(function (d) {
      var o = byBasis[d.id];
      if (!o) { out.push(d); return; }
      if (o.deleted) return;
      var merged = {};
      Object.keys(d).forEach(function (k) { merged[k] = d[k]; });
      ['name', 'jahre', 'hinweis', 'kat', 'gruppe', 'tags'].forEach(function (k) {
        if (o[k] !== undefined && o[k] !== null && o[k] !== '') merged[k] = o[k];
      });
      merged.quelle = 'org';
      merged.basisId = d.id;
      merged.orgRecordId = o.id;
      out.push(merged);
    });
    eigene.forEach(function (r) {
      out.push({
        id: r.id, kat: r.kat || 'leitungen', gruppe: r.gruppe || '',
        name: r.name || '(ohne Bezeichnung)', jahre: Number(r.jahre) || 0,
        hinweis: r.hinweis || '', quelle: 'org', tags: r.tags || [],
        orgRecordId: r.id
      });
    });
    return out;
  }

  /*ENGINE-END*/

  // ════════════════════════════════════════════════════════════
  // Cloud-Anbindung (nur Browser): Org-Erweiterungen per-Record.
  // Pool ist org-übergreifend → NUR saveRecord/deleteRecord,
  // gelesen wird auf die eigene Org gefiltert.
  // ════════════════════════════════════════════════════════════
  var LD_POOL = 'gema_ld_kat_pool_v1';
  var LD_MODULE = 'lebensdauer';
  var LD_PREFIX = 'ldkat:';
  var _hatWindow = (typeof window !== 'undefined');
  var _bindP = null;

  function _myOrgId() {
    try {
      if (!_hatWindow || typeof window.GemaAuth === 'undefined') return '';
      var u = window.GemaAuth.getCurrentUser();
      return (u && u.orgId) || '';
    } catch (e) { return ''; }
  }

  function _cachedPool() {
    try {
      if (_hatWindow && typeof window.GemaSync !== 'undefined' && window.GemaSync.getCached) {
        return window.GemaSync.getCached(LD_POOL) || [];
      }
    } catch (e) { }
    try {
      if (_hatWindow) {
        var raw = window.localStorage.getItem(LD_POOL);
        if (raw) { var arr = JSON.parse(raw); if (Array.isArray(arr)) return arr; }
      }
    } catch (e2) { }
    return [];
  }

  function _orgRecords() {
    var org = _myOrgId();
    if (!org) return [];
    return _cachedPool().filter(function (r) { return r && r.orgId === org; });
  }

  function _writeLocal(arr) {
    try { if (_hatWindow) window.localStorage.setItem(LD_POOL, JSON.stringify(arr)); } catch (e) { }
  }

  function _saveRec(rec) {
    var pool = _cachedPool().filter(function (r) { return r && r.id !== rec.id; });
    pool.push(rec);
    _writeLocal(pool);
    try {
      if (_hatWindow && typeof window.GemaSync !== 'undefined') {
        window.GemaSync.saveRecord(LD_MODULE, LD_PREFIX + rec.id, rec).catch(function () { });
      }
    } catch (e) { }
    _fireChanged();
  }

  function _deleteRec(id) {
    var pool = _cachedPool().filter(function (r) { return r && r.id !== id; });
    _writeLocal(pool);
    try {
      if (_hatWindow && typeof window.GemaSync !== 'undefined') {
        window.GemaSync.deleteRecord(LD_MODULE, LD_PREFIX + id).catch(function () { });
      }
    } catch (e) { }
    _fireChanged();
  }

  function _fireChanged() {
    try { if (_hatWindow) window.dispatchEvent(new CustomEvent('gema-lebensdauer-changed')); } catch (e) { }
  }

  function bind() {
    if (_bindP) return _bindP;
    if (!_hatWindow || typeof window.GemaSync === 'undefined' || !window.GemaSync.bindCollection) {
      _bindP = Promise.resolve([]);
      return _bindP;
    }
    _bindP = window.GemaSync.bindCollection(LD_MODULE, LD_POOL, LD_PREFIX, 'id')
      .then(function (arr) { _fireChanged(); return arr; })
      .catch(function () { return _cachedPool(); });
    return _bindP;
  }

  // ── Öffentliche API ────────────────────────────────────────
  var api = {
    // Daten
    KATEGORIEN: LD_KATEGORIEN,
    NUTZUNGEN: LD_NUTZUNGEN,
    QUELLEN: LD_QUELLEN,
    AMPEL: LD_AMPEL,
    KATALOG: LD_KATALOG,
    BESCHICHTUNGEN: LD_BESCHICHTUNGEN,
    BESCH_KRITERIEN: LD_BESCH_KRITERIEN,
    BESCH_LEGENDE: LD_BESCH_LEGENDE,

    // Cloud
    bind: bind,

    // Wirksamer Katalog (Standard + Firmen-Anpassungen)
    alle: function () { return ldEffektiv(LD_KATALOG, _orgRecords()); },
    byId: function (id) {
      var liste = api.alle();
      for (var i = 0; i < liste.length; i++) { if (liste[i].id === id) return liste[i]; }
      return null;
    },
    suche: function (q, opts) {
      var liste = api.alle();
      if (opts && opts.kat) liste = liste.filter(function (e) { return e.kat === opts.kat; });
      return ldSucheIn(liste, q);
    },
    kategorie: function (katId) {
      for (var i = 0; i < LD_KATEGORIEN.length; i++) { if (LD_KATEGORIEN[i].id === katId) return LD_KATEGORIEN[i]; }
      return null;
    },
    quelleLabel: function (q) { return LD_QUELLEN[q] || q || ''; },

    // Rechnen
    berechne: ldBerechne,
    reduktion: ldReduktion,
    ampel: ldAmpel,
    ampelInfo: function (a) { return LD_AMPEL[a] || null; },
    // Eintrag + Einbaujahr (+ optionale Nutzung) → volle Auswertung
    berechneFuer: function (id, einbaujahr, heute, nutzungId) {
      var e = api.byId(id);
      if (!e) return null;
      var jahre = (nutzungId && nutzungId !== 'wohnen') ? ldReduktion(e.jahre, nutzungId) : e.jahre;
      var r = ldBerechne(einbaujahr, jahre, heute);
      if (!r) return null;
      r.eintrag = e;
      r.jahreBasis = e.jahre;
      r.nutzungId = nutzungId || 'wohnen';
      return r;
    },

    // Firmen-Anpassungen (Org-Records)
    // Standard-Eintrag übersteuern: speichern({basisId:'lt_kw_kupfer', jahre:45, hinweis:'…'})
    // Eigener Eintrag:              speichern({name:'…', kat:'leitungen', jahre:40})
    speichern: function (rec) {
      var org = _myOrgId();
      if (!org) return null;
      var out = {};
      Object.keys(rec || {}).forEach(function (k) { out[k] = rec[k]; });
      out.orgId = org;
      delete out.deleted;
      if (out.basisId) {
        out.id = 'ldo_' + org + '_' + out.basisId;          // deterministisch — ein Override pro Firma+Eintrag
      } else if (!out.id) {
        out.id = 'ldn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      }
      out.quelle = 'org';
      _saveRec(out);
      return out;
    },
    // Standard-Eintrag für die Firma ausblenden (Tombstone) bzw.
    // eigenen Eintrag löschen.
    entfernen: function (id) {
      var org = _myOrgId();
      if (!org) return false;
      var istDefault = LD_KATALOG.some(function (d) { return d.id === id; });
      if (istDefault) {
        _saveRec({ id: 'ldo_' + org + '_' + id, orgId: org, basisId: id, deleted: true });
        return true;
      }
      // Org-Record (Override oder eigener Eintrag) hart löschen
      var rec = _orgRecords().filter(function (r) { return r.id === id || r.basisId === id; })[0];
      if (rec) { _deleteRec(rec.id); return true; }
      return false;
    },
    // Override/Tombstone einer Firma zurücknehmen → Standard gilt wieder
    zuruecksetzen: function (basisId) {
      var org = _myOrgId();
      if (!org) return false;
      _deleteRec('ldo_' + org + '_' + basisId);
      return true;
    },

    // Engine-Exports für Node-Tests
    _engine: {
      ldBerechne: ldBerechne, ldAmpel: ldAmpel, ldReduktion: ldReduktion,
      ldNorm: ldNorm, ldSucheIn: ldSucheIn, ldEffektiv: ldEffektiv,
      LD_KATALOG: LD_KATALOG, LD_KATEGORIEN: LD_KATEGORIEN,
      LD_NUTZUNGEN: LD_NUTZUNGEN, LD_QUELLEN: LD_QUELLEN, LD_AMPEL: LD_AMPEL,
      LD_BESCHICHTUNGEN: LD_BESCHICHTUNGEN, LD_BESCH_KRITERIEN: LD_BESCH_KRITERIEN
    }
  };

  if (_hatWindow) window.GemaLebensdauer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
