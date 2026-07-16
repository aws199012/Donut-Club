import { useState } from 'react';
import { api } from '../api.js';

export default function AddCategoryModal({ categories, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Only top-level categories can be a parent — keeps the tree at two levels,
  // matching what the sidebar renders.
  const topLevel = categories.filter((c) => !c.parent_id);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const category = await api.createCategory(name.trim(), parentId ? Number(parentId) : null);
      onCreated(category);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New Category</h2>
        <form className="form" onSubmit={submit}>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </label>

          <label>
            Parent category (optional)
            <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">— top level —</option>
              {topLevel.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>

          {error && <p className="error">{error}</p>}

          <div className="form-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create Category'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
