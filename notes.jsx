// Empty state, modals, toast
const { useState: useStateEmpty } = React;

function EmptyState({ onQuickCreate, onCustom }) {
  const cards = [
    { id: 'project', icon: 'building', title: 'Bauprojekt', desc: 'Reales Objekt mit Adresse und Bauherr', color: '#1e3a5f' },
    { id: 'training', icon: 'grad', title: 'Übungsumgebung', desc: 'Sandbox zum Lernen und Testen', color: '#3B82F6' },
    { id: 'private', icon: 'lock', title: 'Privater Eimer', desc: 'Persönlicher Arbeitsraum, nur für dich', color: '#64748b' },
  ];
  return (
    <div className="gema-empty">
      <div className="gema-empty__inner">
        <div className="gema-empty__badge">
          <Icon name="bucket" size={28} />
        </div>
        <h1 className="gema-empty__hero">Erstelle deinen ersten Eimer</h1>
        <p className="gema-empty__sub">
          Ein Eimer ist dein Arbeitsraum für ein Projekt, eine Übung oder eine Sandbox.
          Module, Notizen und Team an einem Ort.
        </p>
        <div className="gema-empty__cards">
          {cards.map(c => (
            <button key={c.id} className="gema-empty__card" onClick={() => onQuickCreate(c.id)}>
              <div className="gema-empty__card-icon" style={{ color: c.color }}>
                <Icon name={c.icon} size={24} />
              </div>
              <div className="gema-empty__card-title">{c.title}</div>
              <div className="gema-empty__card-desc">{c.desc}</div>
              <div className="gema-empty__card-cta">Eimer anlegen <Icon name="chevron" size={14} /></div>
            </button>
          ))}
        </div>
        <button className="gema-empty__custom" onClick={onCustom}>
          Oder eigenen Namen vergeben →
        </button>
      </div>
    </div>
  );
}

function Modal({ open, onClose, title, children, width = 480 }) {
  if (!open) return null;
  return (
    <div className="gema-modal-backdrop" onClick={onClose}>
      <div className="gema-modal" style={{ maxWidth: width }} onClick={e => e.stopPropagation()}>
        <div className="gema-modal__header">
          <h2 className="gema-modal__title">{title}</h2>
          <button className="gema-icon-btn" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        <div className="gema-modal__body">{children}</div>
      </div>
    </div>
  );
}

function NewBucketModal({ open, onClose, onCreate, orgs, defaultType, defaultName }) {
  const [name, setName] = useStateEmpty(defaultName || '');
  const [type, setType] = useStateEmpty(defaultType || 'project');
  const [org, setOrg] = useStateEmpty(orgs[0]?.id || '');

  React.useEffect(() => {
    if (open) {
      setName(defaultName || '');
      setType(defaultType || 'project');
      setOrg(orgs[0]?.id || '');
    }
  }, [open, defaultName, defaultType]);

  const types = [
    { id: 'project', icon: 'building', label: 'Bauprojekt' },
    { id: 'training', icon: 'grad', label: 'Übung' },
    { id: 'private', icon: 'lock', label: 'Privat' },
    { id: 'shared', icon: 'users', label: 'Team' },
  ];

  return (
    <Modal open={open} onClose={onClose} title="Neuer Eimer" width={520}>
      <div className="gema-form">
        <div className="gema-form__field">
          <label>Name</label>
          <input
            className="gema-input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="z.B. Neubau Bahnhofstrasse 14"
            autoFocus
          />
        </div>
        <div className="gema-form__field">
          <label>Typ</label>
          <div className="gema-type-grid">
            {types.map(t => (
              <button
                key={t.id}
                className={'gema-type-card' + (type === t.id ? ' is-active' : '')}
                onClick={() => setType(t.id)}
              >
                <Icon name={t.icon} size={18} />
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
        {type !== 'private' && (
          <div className="gema-form__field">
            <label>Organisation</label>
            <div className="gema-org-pills">
              {orgs.map(o => (
                <button
                  key={o.id}
                  className={'gema-org-pill' + (org === o.id ? ' is-active' : '')}
                  onClick={() => setOrg(o.id)}
                >{o.name}</button>
              ))}
            </div>
          </div>
        )}
        <div className="gema-form__actions">
          <button className="gema-btn gema-btn--ghost" onClick={onClose}>Abbrechen</button>
          <button
            className="gema-btn gema-btn--primary"
            disabled={!name.trim()}
            onClick={() => onCreate({ name: name.trim(), type, org })}
          >Eimer erstellen</button>
        </div>
      </div>
    </Modal>
  );
}

function ModulePickerModal({ open, onClose, onPick, existingMods }) {
  const all = window.GEMA_DATA.ALL_MODULES;
  return (
    <Modal open={open} onClose={onClose} title="Modul hinzufügen" width={560}>
      <div className="gema-modpicker">
        {all.map(m => {
          const already = existingMods.includes(m.id);
          return (
            <button
              key={m.id}
              className={'gema-modpicker__item' + (already ? ' is-disabled' : '')}
              disabled={already}
              onClick={() => onPick(m.id)}
            >
              <div className="gema-modpicker__icon"><Icon name={m.icon} size={20} /></div>
              <div className="gema-modpicker__meta">
                <div className="gema-modpicker__name">{m.name}</div>
                <div className="gema-modpicker__desc">{m.desc}</div>
              </div>
              {already && <span className="gema-modpicker__tag">bereits hinzugefügt</span>}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

function BucketPickerModal({ open, onClose, buckets, openTabs, onPick }) {
  const closed = buckets.filter(b => !openTabs.includes(b.id));
  return (
    <Modal open={open} onClose={onClose} title="Eimer öffnen" width={480}>
      {closed.length === 0 ? (
        <div className="gema-empty-hint" style={{ padding: '24px 0' }}>Alle Eimer sind bereits geöffnet.</div>
      ) : (
        <div className="gema-bucketpicker">
          {closed.map(b => (
            <button key={b.id} className="gema-bucketpicker__item" onClick={() => onPick(b.id)}>
              <BucketTypeIcon type={b.type} size={16} />
              <span>{b.name}</span>
              {b.shared && <AvatarCluster members={b.members} size={20} />}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

function Toast({ message }) {
  if (!message) return null;
  return (
    <div className="gema-toast" key={message.key}>
      {message.icon && <Icon name={message.icon} size={14} />}
      <span>{message.text}</span>
    </div>
  );
}

window.EmptyState = EmptyState;
window.NewBucketModal = NewBucketModal;
window.ModulePickerModal = ModulePickerModal;
window.BucketPickerModal = BucketPickerModal;
window.Toast = Toast;
window.Modal = Modal;
