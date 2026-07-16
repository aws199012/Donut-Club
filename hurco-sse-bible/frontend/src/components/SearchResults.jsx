import { useEffect, useState } from 'react';
import { api } from '../api.js';
import LocalResultsList from './LocalResultsList.jsx';
import KnowledgeDashboard from './KnowledgeDashboard.jsx';

export default function SearchResults({ query, local, onOpenDocument, onOpenTicket }) {
  const [tab, setTab] = useState('documents');
  const [webResults, setWebResults] = useState(null);
  const [webLoading, setWebLoading] = useState(false);
  const [webError, setWebError] = useState(null);
  const [graph, setGraph] = useState(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState(null);

  const localCount = (local?.documents.length || 0) + (local?.tickets.length || 0);
  const resultsAreThin = localCount < 3;

  useEffect(() => {
    setTab('documents');
    setWebResults(null);
    setWebError(null);
    setGraph(null);
    setGraphError(null);
  }, [query]);

  useEffect(() => {
    if (tab !== 'graph' || graph || graphLoading) return;
    setGraphLoading(true);
    setGraphError(null);
    api
      .searchGraph(query)
      .then(setGraph)
      .catch((err) => setGraphError(err.message))
      .finally(() => setGraphLoading(false));
  }, [tab, query, graph, graphLoading]);

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

      <div className="result-tabs">
        <button
          className={`result-tab ${tab === 'documents' ? 'active' : ''}`}
          onClick={() => setTab('documents')}
        >
          Documents
        </button>
        <button
          className={`result-tab ${tab === 'graph' ? 'active' : ''}`}
          onClick={() => setTab('graph')}
        >
          Insights
        </button>
      </div>

      {tab === 'documents' && (
        <>
          <LocalResultsList local={local} onOpenDocument={onOpenDocument} onOpenTicket={onOpenTicket} />

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
        </>
      )}

      {tab === 'graph' && (
        <section className="result-section">
          {graphLoading && <p className="muted">Analyzing results…</p>}
          {graphError && <p className="error">{graphError}</p>}
          {graph && (
            <KnowledgeDashboard
              graph={graph}
              local={local}
              onOpenDocument={onOpenDocument}
              onOpenTicket={onOpenTicket}
            />
          )}
        </section>
      )}
    </div>
  );
}
