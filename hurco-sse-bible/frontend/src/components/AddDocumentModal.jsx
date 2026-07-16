import { useRef, useState } from 'react';
import { api } from '../api.js';

function titleFromFilename(name) {
  return name.replace(/\.[^.]+$/, '');
}

export default function AddDocumentModal({ categories, documents, onClose, onUploaded }) {
  const [files, setFiles] = useState([]);
  const [statuses, setStatuses] = useState([]); // parallel to files: 'pending' | 'uploading' | 'done' | 'error'
  const [errors, setErrors] = useState([]); // parallel to files: error message or null
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [supersedes, setSupersedes] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const inputRef = useRef(null);

  const isSingle = files.length === 1;

  const pickFiles = (fileList) => {
    const picked = Array.from(fileList || []);
    if (!picked.length) return;
    setFiles(picked);
    setStatuses(picked.map(() => 'pending'));
    setErrors(picked.map(() => null));
    setFormError(null);
    if (picked.length === 1 && !title) setTitle(titleFromFilename(picked[0].name));
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    pickFiles(e.dataTransfer.files);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!files.length) return setFormError('Choose at least one file first.');
    setSubmitting(true);
    setFormError(null);

    const uploaded = [];
    for (let i = 0; i < files.length; i++) {
      setStatuses((s) => s.map((st, idx) => (idx === i ? 'uploading' : st)));
      try {
        const formData = new FormData();
        formData.append('file', files[i]);
        formData.append('title', isSingle ? title : titleFromFilename(files[i].name));
        formData.append('tags', tags);
        if (categoryId) formData.append('category_id', categoryId);
        if (isSingle && supersedes) formData.append('supersedes_document_id', supersedes);
        const doc = await api.uploadDocument(formData);
        uploaded.push(doc);
        setStatuses((s) => s.map((st, idx) => (idx === i ? 'done' : st)));
      } catch (err) {
        setErrors((errs) => errs.map((e2, idx) => (idx === i ? err.message : e2)));
        setStatuses((s) => s.map((st, idx) => (idx === i ? 'error' : st)));
      }
    }

    setSubmitting(false);
    // Only auto-close+navigate when a single file was attempted and it succeeded —
    // for a batch, leave the modal open so per-file success/error stays visible.
    if (uploaded.length) onUploaded(uploaded, isSingle);
  };

  const statusLabel = (status, err) => {
    if (status === 'uploading') return 'Uploading…';
    if (status === 'done') return '✓ Added';
    if (status === 'error') return `✗ ${err || 'Failed'}`;
    return 'Pending';
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add Document{files.length > 1 ? 's' : ''}</h2>
        <form className="form" onSubmit={submit}>
          <div
            className={`dropzone${dragOver ? ' drag-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            {files.length ? (
              <span>{files.length} file{files.length > 1 ? 's' : ''} selected</span>
            ) : (
              <span>Drag & drop one or more files here, or click to browse</span>
            )}
            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => pickFiles(e.target.files)}
            />
          </div>

          {files.length > 0 && (
            <ul className="file-status-list">
              {files.map((f, i) => (
                <li key={i} className={`file-status file-status-${statuses[i]}`}>
                  <span className="file-status-name">{f.name}</span>
                  <span className="file-status-state">{statusLabel(statuses[i], errors[i])}</span>
                </li>
              ))}
            </ul>
          )}

          {isSingle ? (
            <label>
              Title
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </label>
          ) : files.length > 1 ? (
            <p className="muted">Each file will be added as its own document, titled from its filename.</p>
          ) : null}

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

          {isSingle && documents.length > 0 && (
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

          {formError && <p className="error">{formError}</p>}

          <div className="form-actions">
            <button type="button" className="btn" onClick={onClose}>
              {submitting ? 'Close' : 'Cancel'}
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting || !files.length}>
              {submitting ? 'Uploading…' : `Add Document${files.length > 1 ? 's' : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
