import { useEffect, useState } from 'react';
import { api } from '../api.js';

const emptyForm = {
  title: '',
  problem: '',
  resolution: '',
  machine_model: '',
  ticket_date: '',
  tags: '',
};

export default function TicketForm({ ticketId, documents, onSaved, onCancel }) {
  const [form, setForm] = useState(emptyForm);
  const [relatedDocumentIds, setRelatedDocumentIds] = useState([]);

  useEffect(() => {
    if (!ticketId) {
      setForm(emptyForm);
      setRelatedDocumentIds([]);
      return;
    }
    api.getTicket(ticketId).then((t) => {
      setForm({
        title: t.title,
        problem: t.problem,
        resolution: t.resolution || '',
        machine_model: t.machine_model || '',
        ticket_date: t.ticket_date || '',
        tags: t.tags.join(', '),
      });
      setRelatedDocumentIds(t.related_documents.map((d) => d.id));
    });
  }, [ticketId]);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const toggleDocument = (id) => {
    setRelatedDocumentIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
    );
  };

  const submit = async (e) => {
    e.preventDefault();
    const payload = {
      title: form.title.trim(),
      problem: form.problem.trim(),
      resolution: form.resolution.trim() || null,
      machine_model: form.machine_model.trim() || null,
      ticket_date: form.ticket_date || null,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      related_document_ids: relatedDocumentIds,
    };
    const saved = ticketId
      ? await api.updateTicket(ticketId, payload)
      : await api.createTicket(payload);
    onSaved(saved.id);
  };

  return (
    <div className="detail-pane">
      <h2>{ticketId ? 'Edit ticket' : 'New ticket'}</h2>
      <form className="form" onSubmit={submit}>
        <label>
          Title
          <input required value={form.title} onChange={update('title')} />
        </label>
        <label>
          Machine / model
          <input value={form.machine_model} onChange={update('machine_model')} placeholder="e.g. VMX42" />
        </label>
        <label>
          Date
          <input type="date" value={form.ticket_date} onChange={update('ticket_date')} />
        </label>
        <label>
          Problem
          <textarea required rows={4} value={form.problem} onChange={update('problem')} />
        </label>
        <label>
          Resolution
          <textarea rows={4} value={form.resolution} onChange={update('resolution')} />
        </label>
        <label>
          Tags (comma separated)
          <input value={form.tags} onChange={update('tags')} placeholder="servo, alarm" />
        </label>

        {documents.length > 0 && (
          <fieldset>
            <legend>Related documents</legend>
            <div className="checkbox-list">
              {documents.map((d) => (
                <label key={d.id} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={relatedDocumentIds.includes(d.id)}
                    onChange={() => toggleDocument(d.id)}
                  />
                  {d.title}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary">Save ticket</button>
        </div>
      </form>
    </div>
  );
}
