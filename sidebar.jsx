// Notes panel (right column): pages tabs + contenteditable body + admin section
const { useState: useStateNotes, useEffect: useEffectNotes, useRef: useRefNotes } = React;

function NotesPanel({ bucket, onUpdateNote, onAddPage, onRenamePage }) {
  const [activePageId, setActivePageId] = useStateNotes(bucket.notes[0]?.id || null);
  const editorRef = useRefNotes(null);
  const [adminOpen, setAdminOpen] = useStateNotes(false);

  // Reset active page when bucket changes
  useEffectNotes(() => {
    setActivePageId(bucket.notes[0]?.id || null);
  }, [bucket.id]);

  const activePage = bucket.notes.find(n => n.id === activePageId) || bucket.notes[0];

  // Update editor html when active page changes (without nuking on every keystroke)
  useEffectNotes(() => {
    if (editorRef.current && activePage) {
      if (editorRef.current.innerHTML !== activePage.body) {
        editorRef.current.innerHTML = activePage.body;
      }
    }
  }, [activePage?.id, bucket.id]);

  // Click handler for checklist toggle inside contenteditable
  const onEditorClick = (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    const ul = li.parentElement;
    if (!ul || ul.getAttribute('data-checklist') === null) return;
    // Only toggle when clicking the bullet area (left 24px)
    const rect = li.getBoundingClientRect();
    if (e.clientX - rect.left < 28) {
      const cur = li.getAttribute('data-checked') === 'true';
      li.setAttribute('data-checked', cur ? 'false' : 'true');
      // commit
      onUpdateNote(bucket.id, activePage.id, editorRef.current.innerHTML);
    }
  };

  const onEditorInput = () => {
    onUpdateNote(bucket.id, activePage.id, editorRef.current.innerHTML);
  };

  const handleAddPage = () => {
    const newId = onAddPage(bucket.id);
    setActivePageId(newId);
  };

  return (
    <aside className="gema-notes">
      <div className="gema-notes__header">
        <div className="gema-notes__title-wrap">
          <span className="gema-notes__pen"><Icon name="note" size={16} /></span>
          <span className="gema-notes__title">Notizen / Pendenzen</span>
        </div>
        <button className="gema-icon-btn" title="Notiz-Optionen"><Icon name="grip" size={16} /></button>
      </div>

      <div className="gema-notes__pagetabs">
        {bucket.notes.map(p => (
          <button
            key={p.id}
            className={'gema-notes__pagetab' + (activePageId === p.id ? ' is-active' : '')}
            onClick={() => setActivePageId(p.id)}
            onDoubleClick={() => {
              const nv = window.prompt('Seitenname', p.title);
              if (nv && nv.trim()) onRenamePage(bucket.id, p.id, nv.trim());
            }}
            title="Doppelklick zum Umbenennen"
          >{p.title}</button>
        ))}
        <button className="gema-notes__pagetab gema-notes__pagetab--add" onClick={handleAddPage} title="Neue Seite">
          <Icon name="plus" size={12} stroke={2} />
        </button>
      </div>

      <div
        ref={editorRef}
        className="gema-notes__editor"
        contentEditable
        suppressContentEditableWarning
        onInput={onEditorInput}
        onClick={onEditorClick}
        spellCheck={false}
      />

      <div className={'gema-collapse gema-notes__admin' + (adminOpen ? ' is-open' : '')}>
        <button className="gema-collapse__head" onClick={() => setAdminOpen(v => !v)}>
          <span className="gema-section-title">Admin · Architekten-Hierarchie</span>
          <span className="gema-collapse__chev"><Icon name="chevron-down" size={14} /></span>
        </button>
        {adminOpen && (
          <ul className="gema-admin-tree">
            <li>
              <span className="gema-admin-tree__line">Müller Architekten AG</span>
              <ul>
                <li><span className="gema-admin-tree__line">M. Müller <em>· Projektleiter</em></span></li>
                <li><span className="gema-admin-tree__line">A. Bürgi <em>· Architektin</em></span></li>
              </ul>
            </li>
            <li><span className="gema-admin-tree__line">R. Haller <em>· Bauherr</em></span></li>
          </ul>
        )}
      </div>
    </aside>
  );
}

window.NotesPanel = NotesPanel;
