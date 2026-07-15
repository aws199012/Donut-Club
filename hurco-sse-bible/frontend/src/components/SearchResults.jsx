import { useState } from 'react';
import { api } from '../api.js';
import Highlighted from './Highlighted.jsx';

export default function SearchResults({ query, local, onOpenDocument, onOpenTicket }) {
  const [webResults, setWebResults] = useState(null);
  const [webLoading, setWebLoading] = useState(false);
  const [webError, setWebError] = useState(null);

  const localCount = (local?.documents.length || 0) + (local?.tickets.length || 0);
  const resultsAreThin = localCount < 3;

  const runWebSearch = async () => {
    setWebLoading(true);
    setWebError(null);
    try {
      const res = await api.searchWeb(query);
      setWebResults(res.results);
    } catch (err) {
      setWebError(err.message);
    } finally {
      setWebLoading(false);
    }
  };

  return (
    <div className="search-results">
      <h2>Results for "{query}"</h2>

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

      <section className="result-section web-section">
        <h3 className="result-source-label web">From the web</h3>
        {webResults === null && (
          <button className="btn" onClick={runWebSearch} disabled={webLoading}>
            {webLoading
              ? 'Searching the web…'
              : resultsAreThin
              ? 'Local results are thin — search the web'
              : 'Also search the web'}
          </button>
        )}
        {webError && <p className="error">{webError}</p>}
        {webResults?.length === 0 && <p className="muted">No web results found.</p>}
        {webResults?.length > 0 && (
          <ul className="result-list">
            {webResults.map((r, i) => (
              <li key={i}>
                <a className="result-title" href={r.url} target="_blank" rel="noreferrer">
                  🌐 {r.title}
                </a>
                <div className="result-snippet">{r.snippet}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
