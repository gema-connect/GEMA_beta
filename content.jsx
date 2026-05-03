// Main GEMA Workspace app
const { useState: useS, useEffect: useE, useMemo, useRef: useR } = React;

const USER = { name: 'Sandra Caso', role: 'Sanitärplanerin', initials: 'SC' };

// Deep clone helper for seed data
const clone = (x) => JSON.parse(JSON.stringify(x));

function makeBucket({ name, type, org }) {
  const id = 'b-' + Math.random().toString(36).slice(2, 8);
  return {
    id, name, type, org: org || 'jv',
    shared: type === 'shared',
    members: ['SC'],
    created: new Date().toLocaleDateString('de-CH'),
    modules: [],
    activity: [{ who: 'SC', text: `hat „${name}" erstellt`, when: 'gerade eben' }],
    beteiligte: [],
    notes: [{ id: 'n1', title: 'n.Seite 1', body: '<p>Schreibe hier deine erste Notiz …</p>' }],
  };
}

function App() {
  // Seed mode: 'full' (demo data) | 'empty' (first-eimer flow)
  const [mode, setMode] = useS('full');
  const [activeOrg, setActiveOrg] = useS('all');

  // Bucket state
  const [buckets, setBuckets] = useS(() => clone(window.GEMA_DATA.SEED_BUCKETS));
  const [personalIds, setPersonalIds] = useS(() => [...window.GEMA_DATA.PERSONAL_BUCKETS]);
  const [sharedIds, setSharedIds] = useS(() => [...window.GEMA_DATA.SHARED_BUCKETS]);

  // Tabs
  const [openTabs, setOpenTabs] = useS(['b-breisacher']);
  const [activeTab, setActiveTab] = useS('b-breisacher');

  // Modals + toast
  const [newBucketOpen, setNewBucketOpen] = useS(false);
  const [newBucketDefaults, setNewBucketDefaults] = useS({ type: 'project', name: '' });
  const [pickerOpen, setPickerOpen] = useS(false);
  const [bucketPickerOpen, setBucketPickerOpen] = useS(false);
  const [toast, setToast] = useS(null);

  // Tweaks
  const [tweaks, setTweak] = window.useTweaks(/*EDITMODE-BEGIN*/{
    "accentNotes": "#F59E0B",
    "density": "comfortable",
    "showAdminTree": true,
    "tabStyle": "browser"
  }/*EDITMODE-END*/);

  // ----- Mode switching -----
  const loadFull = () => {
    setBuckets(clone(window.GEMA_DATA.SEED_BUCKETS));
    setPersonalIds([...window.GEMA_DATA.PERSONAL_BUCKETS]);
    setSharedIds([...window.GEMA_DATA.SHARED_BUCKETS]);
    setOpenTabs(['b-breisacher']);
    setActiveTab('b-breisacher');
    setMode('full');
    showToast('Demo-Daten geladen', 'refresh');
  };
  const loadEmpty = () => {
    setBuckets([]);
    setPersonalIds([]);
    setSharedIds([]);
    setOpenTabs([]);
    setActiveTab(null);
    setMode('empty');
    showToast('Empty State – noch keine Eimer', 'sparkle');
  };

  // ----- Toast helper -----
  const toastTimer = useR(null);
  const showToast = (text, icon) => {
    setToast({ text, icon, key: Math.random() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  // ----- Bucket CRUD -----
  const createBucket = ({ name, type, org }) => {
    const b = makeBucket({ name, type, org });
    setBuckets(prev => [...prev, b]);
    if (type === 'shared') setSharedIds(prev => [...prev, b.id]);
    else setPersonalIds(prev => [...prev, b.id]);
    setOpenTabs(prev => prev.includes(b.id) ? prev : [...prev, b.id]);
    setActiveTab(b.id);
    if (mode === 'empty') setMode('full');
    setNewBucketOpen(false);
    showToast(`Eimer „${name}" erstellt`, 'check');
  };

  const renameBucket = (id, newName) => {
    setBuckets(prev => prev.map(b => b.id === id ? { ...b, name: newName } : b));
    showToast('Name aktualisiert', 'pencil');
  };

  // ----- Tab handling -----
  const openBucket = (id) => {
    setActiveTab(id);
    setOpenTabs(prev => prev.includes(id) ? prev : [...prev, id]);
  };
  const closeTab = (id) => {
    const idx = openTabs.indexOf(id);
    const next = openTabs.filter(t => t !== id);
    setOpenTabs(next);
    if (activeTab === id) {
      const newActive = next[idx] || next[idx - 1] || next[0] || null;
      setActiveTab(newActive);
    }
  };

  // ----- Modules -----
  const addModule = (bucketId, modId) => {
    setBuckets(prev => prev.map(b => {
      if (b.id !== bucketId) return b;
      if (b.modules.find(m => m.mod === modId)) return b;
      return {
        ...b,
        modules: [...b.modules, { mod: modId, status: 'offen' }],
        activity: [{ who: 'SC', text: `hat ${window.GEMA_DATA.ALL_MODULES.find(x => x.id === modId)?.name || 'Modul'} hinzugefügt`, when: 'gerade eben' }, ...b.activity],
      };
    }));
    setPickerOpen(false);
    showToast('Modul hinzugefügt', 'plus');
  };

  const onModuleClick = (modId) => {
    const m = window.GEMA_DATA.ALL_MODULES.find(x => x.id === modId);
    showToast(`Öffne Modul ${m?.name || ''} …`, m?.icon);
  };

  // ----- Notes -----
  const updateNote = (bucketId, noteId, html) => {
    setBuckets(prev => prev.map(b =>
      b.id !== bucketId ? b : { ...b, notes: b.notes.map(n => n.id === noteId ? { ...n, body: html } : n) }
    ));
  };
  const addNotePage = (bucketId) => {
    const newId = 'n' + Math.random().toString(36).slice(2, 6);
    setBuckets(prev => prev.map(b => {
      if (b.id !== bucketId) return b;
      const idx = b.notes.length + 1;
      return { ...b, notes: [...b.notes, { id: newId, title: `n.Seite ${idx}`, body: '<p></p>' }] };
    }));
    return newId;
  };
  const renameNotePage = (bucketId, noteId, title) => {
    setBuckets(prev => prev.map(b =>
      b.id !== bucketId ? b : { ...b, notes: b.notes.map(n => n.id === noteId ? { ...n, title } : n) }
    ));
  };

  // ----- Filtered sidebar lists -----
  const filterByOrg = (ids) => ids
    .map(id => buckets.find(b => b.id === id))
    .filter(Boolean)
    .filter(b => activeOrg === 'all' || b.org === activeOrg);

  const personalBuckets = filterByOrg(personalIds);
  const sharedBuckets = filterByOrg(sharedIds);

  const activeBucket = buckets.find(b => b.id === activeTab);

  return (
    <div className={'gema-app gema-app--' + tweaks.density}>
      {/* Top bar */}
      <header className="gema-topbar">
        <div className="gema-topbar__brand">
          <div className="gema-brand-mark">
            <span className="gema-brand-mark__bucket"><Icon name="bucket" size={18} /></span>
          </div>
          <div className="gema-topbar__title">
            <div className="gema-topbar__product">GEMA</div>
            <div className="gema-topbar__sub">Workspace</div>
          </div>
        </div>
        <div className="gema-topbar__center">
          <div className="gema-search">
            <Icon name="inbox" size={14} />
            <input placeholder="Eimer, Module oder Personen suchen …" />
            <span className="gema-search__hint">⌘K</span>
          </div>
        </div>
        <div className="gema-topbar__right">
          <button
            className={'gema-btn gema-btn--ghost' + (mode === 'empty' ? ' is-warn' : '')}
            onClick={mode === 'empty' ? loadFull : loadEmpty}
          >
            <Icon name={mode === 'empty' ? 'refresh' : 'sparkle'} size={14} />
            {mode === 'empty' ? 'Demo-Daten laden' : 'Empty State zeigen'}
          </button>
          <Avatar initials="SC" size={32} color="#0c4a2e" />
        </div>
      </header>

      <div className="gema-shell">
        <Sidebar
          user={USER}
          orgs={window.GEMA_DATA.ORGS}
          activeOrg={activeOrg}
          onChangeOrg={setActiveOrg}
          personalBuckets={personalBuckets}
          sharedBuckets={sharedBuckets}
          activeBucketId={activeTab}
          openTabIds={openTabs}
          onOpenBucket={openBucket}
          onNewBucket={() => { setNewBucketDefaults({ type: 'project', name: '' }); setNewBucketOpen(true); }}
        />

        <div className="gema-main">
          {mode === 'full' && openTabs.length > 0 && (
            <TabBar
              tabs={openTabs}
              activeId={activeTab}
              onActivate={setActiveTab}
              onClose={closeTab}
              onAdd={() => setBucketPickerOpen(true)}
              buckets={buckets}
            />
          )}

          {mode === 'empty' || !activeBucket ? (
            <EmptyState
              onQuickCreate={(typeId) => {
                const presets = {
                  project: { name: 'Mein erstes Bauprojekt', type: 'project' },
                  training: { name: 'Übungsumgebung', type: 'training' },
                  private: { name: 'Privater Eimer', type: 'private' },
                };
                createBucket({ ...presets[typeId], org: activeOrg === 'all' ? 'jv' : activeOrg });
              }}
              onCustom={() => { setNewBucketDefaults({ type: 'project', name: '' }); setNewBucketOpen(true); }}
            />
          ) : (
            <div className="gema-workspace" data-screen-label="Workspace">
              <BucketContent
                bucket={activeBucket}
                orgs={window.GEMA_DATA.ORGS}
                onRename={renameBucket}
                onOpenModulePicker={() => setPickerOpen(true)}
                onModuleClick={onModuleClick}
                onShare={() => showToast('Teilen-Dialog (Mock)', 'share')}
                onInvite={() => showToast('Einladung versenden (Mock)', 'plus')}
              />
              <NotesPanel
                bucket={activeBucket}
                onUpdateNote={updateNote}
                onAddPage={addNotePage}
                onRenamePage={renameNotePage}
              />
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <NewBucketModal
        open={newBucketOpen}
        onClose={() => setNewBucketOpen(false)}
        onCreate={createBucket}
        orgs={window.GEMA_DATA.ORGS}
        defaultType={newBucketDefaults.type}
        defaultName={newBucketDefaults.name}
      />
      <ModulePickerModal
        open={pickerOpen && !!activeBucket}
        onClose={() => setPickerOpen(false)}
        onPick={(modId) => addModule(activeBucket.id, modId)}
        existingMods={activeBucket?.modules.map(m => m.mod) || []}
      />
      <BucketPickerModal
        open={bucketPickerOpen}
        onClose={() => setBucketPickerOpen(false)}
        buckets={[...personalIds, ...sharedIds].map(id => buckets.find(b => b.id === id)).filter(Boolean)}
        openTabs={openTabs}
        onPick={(id) => { openBucket(id); setBucketPickerOpen(false); }}
      />

      <Toast message={toast} />

      {/* Tweaks panel */}
      <window.TweaksPanel title="Tweaks">
        <window.TweakSection title="Layout">
          <window.TweakRadio
            label="Dichte"
            value={tweaks.density}
            options={[{ value: 'compact', label: 'Kompakt' }, { value: 'comfortable', label: 'Komfortabel' }]}
            onChange={(v) => setTweak('density', v)}
          />
          <window.TweakToggle
            label="Admin-Hierarchie zeigen"
            checked={tweaks.showAdminTree}
            onChange={(v) => setTweak('showAdminTree', v)}
          />
        </window.TweakSection>
        <window.TweakSection title="Akzente">
          <window.TweakColor
            label="Notizen-Akzent"
            value={tweaks.accentNotes}
            onChange={(v) => setTweak('accentNotes', v)}
          />
        </window.TweakSection>
        <window.TweakSection title="Demo">
          <window.TweakButton onClick={mode === 'empty' ? loadFull : loadEmpty}>
            {mode === 'empty' ? 'Demo-Daten laden' : 'Empty State zeigen'}
          </window.TweakButton>
        </window.TweakSection>
      </window.TweaksPanel>

      <style>{`
        .gema-app { --accent-notes: ${tweaks.accentNotes}; }
        .gema-notes__pen, .gema-notes__title { color: var(--accent-notes); }
        .gema-notes__pagetab.is-active { color: var(--accent-notes); border-bottom-color: var(--accent-notes); }
      `}</style>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
