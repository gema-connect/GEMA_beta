// Browser-style tab bar above content columns

function TabBar({ tabs, activeId, onActivate, onClose, onAdd, buckets }) {
  return (
    <div className="gema-tabbar">
      <div className="gema-tabs">
        {tabs.map(id => {
          const b = buckets.find(x => x.id === id);
          if (!b) return null;
          const isActive = id === activeId;
          return (
            <div
              key={id}
              className={'gema-tab' + (isActive ? ' is-active' : '')}
              onClick={() => onActivate(id)}
              title={b.name}
            >
              <span className="gema-tab__icon"><BucketTypeIcon type={b.type} size={14} /></span>
              <span className="gema-tab__name">{b.name}</span>
              <button
                className="gema-tab__close"
                onClick={(e) => { e.stopPropagation(); onClose(id); }}
                title="Tab schliessen"
                aria-label="Schliessen"
              >
                <Icon name="x" size={12} stroke={2} />
              </button>
            </div>
          );
        })}
        <button className="gema-tab gema-tab--add" onClick={onAdd} title="Eimer öffnen">
          <Icon name="plus" size={14} stroke={2} />
        </button>
      </div>
    </div>
  );
}

window.TabBar = TabBar;
