// Eimer content: header, module grid, activity feed, beteiligte
const { useState: useStateContent, useRef: useRefContent } = React;

function ModuleTile({ mod, status, onClick }) {
  const m = window.GEMA_DATA.ALL_MODULES.find(x => x.id === mod);
  if (!m) return null;
  const isCalc = status === 'berechnet';
  return (
    <button className="gema-mod-tile" onClick={onClick} title={m.desc}>
      <div className="gema-mod-tile__icon-wrap">
        <Icon name={m.icon} size={22} />
      </div>
      <div className="gema-mod-tile__body">
        <div className="gema-mod-tile__name">{m.name}</div>
        <div className={'gema-mod-tile__status' + (isCalc ? ' is-done' : '')}>
          <span className="gema-mod-tile__dot" />
          {isCalc ? 'berechnet' : 'offen'}
        </div>
      </div>
    </button>
  );
}

function AddModuleTile({ onClick }) {
  return (
    <button className="gema-mod-tile gema-mod-tile--add" onClick={onClick}>
      <div className="gema-mod-tile__plus"><Icon name="plus" size={20} stroke={1.6} /></div>
      <div className="gema-mod-tile__add-label">Modul hinzufügen</div>
    </button>
  );
}

function HeroAddModule({ onClick }) {
  return (
    <button className="gema-mod-hero" onClick={onClick}>
      <div className="gema-mod-hero__plus"><Icon name="plus" size={28} stroke={1.6} /></div>
      <div className="gema-mod-hero__title">Erstes Modul hinzufügen</div>
      <div className="gema-mod-hero__sub">
        Wähle aus Enthärtung, Osmose, LU-Tabelle, W12, Druckerhöhung …
      </div>
    </button>
  );
}

function EditableTitle({ value, onChange }) {
  const ref = useRefContent(null);
  const [editing, setEditing] = useStateContent(false);
  const start = () => {
    setEditing(true);
    setTimeout(() => {
      ref.current?.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(ref.current);
      sel.removeAllRanges(); sel.addRange(range);
    }, 0);
  };
  const commit = () => {
    setEditing(false);
    const t = ref.current?.innerText.trim();
    if (t && t !== value) onChange(t);
    else if (ref.current) ref.current.innerText = value;
  };
  return (
    <h1
      ref={ref}
      className={'gema-bucket-title' + (editing ? ' is-editing' : '')}
      contentEditable={editing}
      suppressContentEditableWarning
      onClick={() => !editing && start()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); ref.current?.blur(); }
        if (e.key === 'Escape') { ref.current.innerText = value; ref.current?.blur(); }
      }}
    >{value}</h1>
  );
}

function ActivityFeed({ items }) {
  const palette = { SC: '#0c4a2e', RV: '#1e3a5f', SG: '#3B82F6', TM: '#7c3aed', JK: '#F59E0B', BL: '#10B981' };
  return (
    <div className="gema-activity">
      <div className="gema-section-head">
        <span className="gema-section-title">Aktivität</span>
      </div>
      <ul className="gema-activity__list">
        {items.map((a, i) => (
          <li key={i} className="gema-activity__item">
            <Avatar initials={a.who} size={28} color={palette[a.who] || '#475569'} />
            <div className="gema-activity__body">
              <span className="gema-activity__who">{a.who}</span> {a.text}
              <span className="gema-activity__time"> · {a.when}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Beteiligte({ items }) {
  const [open, setOpen] = useStateContent(true);
  if (!items || items.length === 0) return null;
  return (
    <div className={'gema-collapse' + (open ? ' is-open' : '')}>
      <button className="gema-section-head gema-collapse__head" onClick={() => setOpen(v => !v)}>
        <span className="gema-section-title">Beteiligte</span>
        <span className="gema-collapse__count">{items.length}</span>
        <span className="gema-collapse__chev"><Icon name="chevron-down" size={16} /></span>
      </button>
      {open && (
        <ul className="gema-people">
          {items.map((p, i) => (
            <li key={i} className="gema-people__row">
              <Avatar initials={p.name.split(' ').map(s => s[0]).join('').slice(0, 2)} size={32} color="#475569" />
              <div className="gema-people__meta">
                <div className="gema-people__name">{p.name} <span className="gema-people__role">· {p.role}</span></div>
                <div className="gema-people__org">{p.org}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BucketContent({ bucket, orgs, onRename, onOpenModulePicker, onModuleClick, onShare, onInvite }) {
  const org = orgs.find(o => o.id === bucket.org);
  const noModules = bucket.modules.length === 0;
  return (
    <main className="gema-content">
      <div className="gema-bucket-header">
        <div className="gema-bucket-header__left">
          <div className="gema-bucket-header__type"><BucketTypeIcon type={bucket.type} size={18} /></div>
          <div className="gema-bucket-header__titles">
            <EditableTitle value={bucket.name} onChange={(v) => onRename(bucket.id, v)} />
            <div className="gema-bucket-header__meta">
              <span className="gema-meta-chip">{org?.name || '—'}</span>
              <span className="gema-meta-sep">·</span>
              <span className="gema-meta-chip"><Icon name="users" size={12} /> {bucket.members.length} Mitglied{bucket.members.length === 1 ? '' : 'er'}</span>
              <span className="gema-meta-sep">·</span>
              <span className="gema-meta-chip">erstellt {bucket.created}</span>
            </div>
          </div>
        </div>
        <div className="gema-bucket-header__actions">
          <button className="gema-btn gema-btn--ghost" onClick={onInvite}><Icon name="plus" size={14} /> Einladen</button>
          <button className="gema-btn gema-btn--ghost" onClick={onShare}>
            <Icon name="share" size={14} />
            {bucket.shared ? `Geteilt: ${bucket.members.length} Personen` : 'Teilen'}
          </button>
        </div>
      </div>

      <div className="gema-content__scroll">
        <div className="gema-section-head">
          <span className="gema-section-title">Module</span>
          <span className="gema-section-count">{bucket.modules.length}</span>
        </div>

        {noModules ? (
          <HeroAddModule onClick={onOpenModulePicker} />
        ) : (
          <div className="gema-mod-grid">
            {bucket.modules.map((m, i) => (
              <ModuleTile key={i} mod={m.mod} status={m.status} onClick={() => onModuleClick(m.mod)} />
            ))}
            <AddModuleTile onClick={onOpenModulePicker} />
          </div>
        )}

        <ActivityFeed items={bucket.activity} />

        <Beteiligte items={bucket.beteiligte} />
      </div>
    </main>
  );
}

window.BucketContent = BucketContent;
window.ModuleTile = ModuleTile;
