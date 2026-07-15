import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function TicketDetail({ ticketId, onOpenDocument, onEdit }) {
  const [ticket, setTicket] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.getTicket(ticketId).then((t) => {
      if (!cancelled) setTicket(t);
    });
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  if (!ticket) return <div className="detail-pane">Loading…</div>;

  return (
    <div className="detail-pane">
      <div className="detail-header">
        <h2>🎫 {ticket.title}</h2>
        <button className="btn" onClick={() => onEdit(ticket.id)}>Edit</button>
      </div>

      <dl className="meta-grid">
        <dt>Machine / model</dt>
        <dd>{ticket.machine_model || '—'}</dd>
        <dt>Date</dt>
        <dd>{ticket.ticket_date || '—'}</dd>
        <dt>Tags</dt>
        <dd>{ticket.tags.map((t) => <span key={t} className="tag">{t}</span>)}</dd>
      </dl>

      <h3>Problem</h3>
      <p>{ticket.problem}</p>

      <h3>Resolution</h3>
      <p>{ticket.resolution || 'Not resolved yet.'}</p>

      {ticket.related_documents?.length > 0 && (
        <>
          <h3>Related documents</h3>
          <ul className="related-list">
            {ticket.related_documents.map((d) => (
              <li key={d.id}>
                <button className="link-btn" onClick={() => onOpenDocument(d.id)}>📄 {d.title}</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
