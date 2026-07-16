import { Router } from 'express';
import { db } from '../db.js';
import { searchWeb } from '../websearch.js';
import { aggregateGraph } from '../graph/aggregate.js';

export const searchRouter = Router();

const HL_START = '';
const HL_END = '';

function ftsQuery(raw) {
  // Turn free-text into an FTS5 prefix query so partial words still match.
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `${term.replace(/["']/g, '')}*`)
    .join(' ');
}

searchRouter.get('/local', (req, res) => {
  const q = (req.query.q || '').toString();
  if (!q.trim()) return res.json({ documents: [], tickets: [] });

  // Highlights are wrapped in control-character markers (not '<mark>') so the
  // frontend can render them by splitting text into spans, never by injecting
  // raw HTML from user-uploaded file content.
  const matches = db
    .prepare(
      `SELECT type, ref_id, title,
              snippet(search_fts, 4, ?, ?, '...', 20) AS snippet,
              rank
       FROM search_fts WHERE search_fts MATCH ? ORDER BY rank LIMIT 25`
    )
    .all(HL_START, HL_END, ftsQuery(q));

  const documentIds = matches.filter((m) => m.type === 'document').map((m) => m.ref_id);
  const ticketIds = matches.filter((m) => m.type === 'ticket').map((m) => m.ref_id);

  const documents = documentIds.length
    ? db
        .prepare(
          `SELECT id, title, category_id, date_added FROM documents
           WHERE id IN (${documentIds.map(() => '?').join(',')}) AND is_current = 1`
        )
        .all(...documentIds)
    : [];
  const tickets = ticketIds.length
    ? db
        .prepare(
          `SELECT id, title, machine_model, ticket_date FROM tickets
           WHERE id IN (${ticketIds.map(() => '?').join(',')})`
        )
        .all(...ticketIds)
    : [];

  const snippetByRef = new Map(matches.map((m) => [`${m.type}:${m.ref_id}`, m.snippet]));

  res.json({
    documents: documents.map((d) => ({ ...d, snippet: snippetByRef.get(`document:${d.id}`) })),
    tickets: tickets.map((t) => ({ ...t, snippet: snippetByRef.get(`ticket:${t.id}`) })),
  });
});

searchRouter.get('/graph', (req, res) => {
  const q = (req.query.q || '').toString();
  if (!q.trim()) {
    return res.json({ query: q, nodes: [], edges: [], meta: { matchedSources: 0, entityCount: 0, relationshipCount: 0 } });
  }

  const matches = db
    .prepare('SELECT type, ref_id FROM search_fts WHERE search_fts MATCH ? LIMIT 25')
    .all(ftsQuery(q));

  const documentIds = matches.filter((m) => m.type === 'document').map((m) => m.ref_id);
  const ticketIds = matches.filter((m) => m.type === 'ticket').map((m) => m.ref_id);

  const documents = documentIds.length
    ? db
        .prepare(
          `SELECT id, title, graph_data FROM documents
           WHERE id IN (${documentIds.map(() => '?').join(',')}) AND is_current = 1`
        )
        .all(...documentIds)
    : [];
  const tickets = ticketIds.length
    ? db
        .prepare(`SELECT id, title, graph_data FROM tickets WHERE id IN (${ticketIds.map(() => '?').join(',')})`)
        .all(...ticketIds)
    : [];

  const sources = [
    ...documents.map((d) => ({
      type: 'document',
      id: d.id,
      title: d.title,
      graphData: d.graph_data ? JSON.parse(d.graph_data) : null,
    })),
    ...tickets.map((t) => ({
      type: 'ticket',
      id: t.id,
      title: t.title,
      graphData: t.graph_data ? JSON.parse(t.graph_data) : null,
    })),
  ];

  res.json(aggregateGraph(q, sources));
});

searchRouter.get('/web', async (req, res) => {
  const q = (req.query.q || '').toString();
  if (!q.trim()) return res.json({ results: [] });

  try {
    const results = await searchWeb(q);
    res.json({ results, source: process.env.BING_SEARCH_KEY ? 'bing' : 'duckduckgo' });
  } catch (err) {
    res.status(502).json({ error: `Web search failed: ${err.message}` });
  }
});
