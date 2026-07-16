import { db } from '../db.js';
import { extractGraphData, EXTRACT_VERSION } from './extract.js';

// Computes and persists graph_data for one record. Called from the document/ticket
// write routes (and the seed script) — never at search time, so search stays fast
// no matter how much text a document has.
export function computeDocumentGraph(documentId, text) {
  const graphData = extractGraphData(text);
  db.prepare('UPDATE documents SET graph_data = ? WHERE id = ?').run(
    JSON.stringify(graphData),
    documentId
  );
  return graphData;
}

export function computeTicketGraph(ticketId, text) {
  const graphData = extractGraphData(text);
  db.prepare('UPDATE tickets SET graph_data = ? WHERE id = ?').run(
    JSON.stringify(graphData),
    ticketId
  );
  return graphData;
}

// Runs once at server startup: extracts graph_data for records that don't have it
// yet, and re-extracts records whose stored data predates the current extraction
// rules (EXTRACT_VERSION mismatch) — so dictionary/rule tuning propagates to the
// whole library on restart with no manual re-saving. No-op when everything is
// already at the current version.
function isStale(graphDataJson) {
  if (!graphDataJson) return true;
  try {
    return JSON.parse(graphDataJson).v !== EXTRACT_VERSION;
  } catch {
    return true;
  }
}

export function backfillGraphData() {
  const documents = db
    .prepare('SELECT id, title, notes, extracted_text, graph_data FROM documents')
    .all()
    .filter((d) => isStale(d.graph_data));
  for (const d of documents) {
    computeDocumentGraph(d.id, `${d.title}\n${d.notes || ''}\n${d.extracted_text || ''}`);
  }

  const tickets = db
    .prepare('SELECT id, title, problem, resolution, machine_model, graph_data FROM tickets')
    .all()
    .filter((t) => isStale(t.graph_data));
  for (const t of tickets) {
    computeTicketGraph(t.id, `${t.title}\n${t.problem}\n${t.resolution || ''}\n${t.machine_model || ''}`);
  }

  if (documents.length || tickets.length) {
    console.log(
      `Knowledge graph: (re)extracted ${documents.length} document(s), ${tickets.length} ticket(s).`
    );
  }
}
