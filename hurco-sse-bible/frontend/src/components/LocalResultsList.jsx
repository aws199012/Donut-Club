import Highlighted from './Highlighted.jsx';

// Shared between the "Documents" tab and the Knowledge Graph tab's sparse-result
// fallback, so both show the exact same local-library list.
export default function LocalResultsList({ local, onOpenDocument, onOpenTicket }) {
  const localCount = (local?.documents.length || 0) + (local?.tickets.length || 0);

  return (
    <section className="result-section">
      <h3 className="result-source-label local">From your library</h3>
      {localCount === 0 && <p className="muted">No matches in your documents or tickets.</p>}

      {local?.documents.length > 0 && (
        <ul className="result-list">
          {local.documents.map((doc) => (
            <li key={`doc-${doc.id}`} onClick={() => onOpenDocument(doc.id)}>
              <div className="result-title">📄 {doc.title}</div>
              <div className="result-snippet">
                <Highlighted text={doc.snippet} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {local?.tickets.length > 0 && (
        <ul className="result-list">
          {local.tickets.map((t) => (
            <li key={`ticket-${t.id}`} onClick={() => onOpenTicket(t.id)}>
              <div className="result-title">🎫 {t.title}</div>
              <div className="result-snippet">
                <Highlighted text={t.snippet} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
