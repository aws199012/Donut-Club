import { useRef, useState } from 'react';
import { api } from '../api.js';

export default function AddDocumentModal({ categories, documents, onClose, onUploaded }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [supersedes, setSupersedes] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const pickFile = (f) => {
    if (!f) return;
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    pickFile(e.dataTransfer.files?.[0]);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return setError('Choose a file first.');
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title);
      formData.append('tags', tags);
      if (categoryId) formData.append('category_id', categoryId);
      if (supersedes) formData.append('supersedes_document_id', supersedes);
      const doc = await api.uploadDocument(formData);
      onUploaded(doc);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add Document</h2>
        <form className="form" onSubmit={submit}>
          <div
            className={`dropzone${dragOver ? ' drag-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            {file ? <span>{file.name}</span> : <span>Drag & drop a file here, or click to browse</span>}
            <input
              ref={inputRef}
              type="file"
              hidden
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
          </div>

          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>

          <label>
            Category
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Let the app suggest one</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>

          <label>
            Tags (comma separated)
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="wiring, x-axis" />
          </label>

          {documents.length > 0 && (
            <label>
              This replaces an existing document (optional)
              <select value={supersedes} onChange={(e) => setSupersedes(e.target.value)}>
                <option value="">— new document, not a new version —</option>
                {documents.map((d) => (
                  <option key={d.id} value={d.id}>{d.title} (v{d.version_number})</option>
                ))}
              </select>
            </label>
          )}

          {error && <p className="error">{error}</p>}

          <div className="form-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Uploading…' : 'Add Document'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
