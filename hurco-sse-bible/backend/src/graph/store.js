import { db } from '../db.js';
import { extractGraphData } from './extract.js';

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

// Runs once at server startup so documents/tickets created before this feature
// existed get graph_data without the user having to re-save each one by hand.
// Cheap after the first run — only rows with NULL graph_data do any work.
export function backfillGraphData() {
  const documents = db.prepare('SELECT id, title, notes, extracted_text FROM documents WHERE graph_data IS NULL').all();
  for (const d of documents) {
    computeDocumentGraph(d.id, `${d.title}\n${d.notes || ''}\n${d.extracted_text || ''}`);
  }

  const tickets = db
    .prepare('SELECT id, title, problem, resolution, machine_model FROM tickets WHERE graph_data IS NULL')
    .all();
  for (const t of tickets) {
    computeTicketGraph(t.id, `${t.title}\n${t.problem}\n${t.resolution || ''}\n${t.machine_model || ''}`);
  }

  if (documents.length || tickets.length) {
    console.log(`Knowledge graph: backfilled ${documents.length} document(s), ${tickets.length} ticket(s).`);
  }
}
