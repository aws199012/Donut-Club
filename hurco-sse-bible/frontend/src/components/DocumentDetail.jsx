import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function DocumentDetail({ documentId, categories, onOpenTicket, onChanged }) {
  const [doc, setDoc] = useState(null);
  const [editingTags, setEditingTags] = useState(false);
  const [tagsInput, setTagsInput] = useState('');
  const [categoryId, setCategoryId] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.getDocument(documentId).then((d) => {
      if (cancelled) return;
      setDoc(d);
      setTagsInput(d.tags.join(', '));
      setCategoryId(d.category_id || '');
    });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  if (!doc) return <div className="detail-pane">Loading…</div>;

  const saveTags = async () => {
    const updated = await api.updateDocument(doc.id, { tags: tagsInput.split(',').map((t) => t.trim()).filter(Boolean) });
    setDoc(updated);
    setEditingTags(false);
    onChanged?.();
  };

  const changeCategory = async (e) => {
    const newCategoryId = Number(e.target.value);
    setCategoryId(newCategoryId);
    const updated = await api.updateDocument(doc.id, { category_id: newCategoryId });
    setDoc(updated);
    onChanged?.();
  };

  return (
    <div className="detail-pane">
      <div className="detail-header">
        <h2>{doc.title}</h2>
        <a className="btn" href={`/${doc.filepath}`} target="_blank" rel="noreferrer">
          Open file
        </a>
      </div>

      <dl className="meta-grid">
        <dt>Category</dt>
        <dd>
          <select value={categoryId} onChange={changeCategory}>
            <option value="">— none —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {doc.category_suggested ? <span className="badge">auto-suggested</span> : null}
        </dd>

        <dt>Tags</dt>
        <dd>
          {editingTags ? (
            <div className="tag-editor">
              <input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} />
              <button className="btn btn-primary" onClick={saveTags}>Save</button>
            </div>
          ) : (
            <>
              {doc.tags.map((t) => (
                <span key={t} className="tag">{t}</span>
              ))}
              <button className="link-btn" onClick={() => setEditingTags(true)}>edit</button>
            </>
          )}
        </dd>

        <dt>Date added</dt>
        <dd>{doc.date_added}</dd>

        <dt>Version</dt>
        <dd>
          v{doc.version_number}
          {doc.versions?.length > 1 && (
            <span className="muted"> ({doc.versions.length} versions on file)</span>
          )}
        </dd>

        <dt>Source file</dt>
        <dd>{doc.filename}</dd>
      </dl>

      {doc.notes && (
        <>
          <h3>Notes</h3>
          <p>{doc.notes}</p>
        </>
      )}

      {doc.related_tickets?.length > 0 && (
        <>
          <h3>Related tickets</h3>
          <ul className="related-list">
            {doc.related_tickets.map((t) => (
              <li key={t.id}>
                <button className="link-btn" onClick={() => onOpenTicket(t.id)}>🎫 {t.title}</button>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Extracted text preview</h3>
      <pre className="text-preview">{(doc.extracted_text || '').slice(0, 2000) || '(no extractable text)'}</pre>
    </div>
  );
}
