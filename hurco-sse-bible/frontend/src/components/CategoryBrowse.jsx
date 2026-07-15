import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function CategoryBrowse({ categoryId, categories, onOpenDocument, onOpenTicket }) {
  const [items, setItems] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    api.getCategoryItems(categoryId).then((data) => {
      if (!cancelled) setItems(data);
    });
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  const category = categories.find((c) => c.id === categoryId);

  if (!items) return <div className="detail-pane">Loading…</div>;

  return (
    <div className="detail-pane">
      <h2>{category?.name || 'Category'}</h2>

      <h3>Documents</h3>
      {items.documents.length === 0 && <p className="muted">No documents in this category yet.</p>}
      <ul className="browse-list">
        {items.documents.map((d) => (
          <li key={d.id}>
            <button className="link-btn" onClick={() => onOpenDocument(d.id)}>
              📄 {d.title} {d.version_number > 1 ? `(v${d.version_number})` : ''}
            </button>
            <span className="muted"> — added {d.date_added}</span>
          </li>
        ))}
      </ul>

      <h3>Tickets</h3>
      {items.tickets.length === 0 && <p className="muted">No tickets in this category yet.</p>}
      <ul className="browse-list">
        {items.tickets.map((t) => (
          <li key={t.id}>
            <button className="link-btn" onClick={() => onOpenTicket(t.id)}>🎫 {t.title}</button>
            {t.ticket_date && <span className="muted"> — {t.ticket_date}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
