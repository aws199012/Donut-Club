import { Router } from 'express';
import { db, upsertTags, reindexFts, removeFromFts, getCategoryIdByName } from '../db.js';

export const ticketsRouter = Router();

function getTicketTags(ticketId) {
  return db
    .prepare(
      `SELECT t.name FROM tags t
       JOIN ticket_tags tt ON tt.tag_id = t.id
       WHERE tt.ticket_id = ?`
    )
    .all(ticketId)
    .map((r) => r.name);
}

function getLinkedDocuments(ticketId) {
  return db
    .prepare(
      `SELECT d.id, d.title FROM documents d
       JOIN document_ticket_links l ON l.document_id = d.id
       WHERE l.ticket_id = ? AND d.is_current = 1`
    )
    .all(ticketId);
}

function serializeTicket(ticket) {
  return {
    ...ticket,
    tags: getTicketTags(ticket.id),
    related_documents: getLinkedDocuments(ticket.id),
  };
}

ticketsRouter.get('/', (req, res) => {
  const tickets = db.prepare('SELECT * FROM tickets ORDER BY date_added DESC').all();
  res.json(tickets.map(serializeTicket));
});

ticketsRouter.get('/:id', (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'not found' });
  res.json(serializeTicket(ticket));
});

ticketsRouter.post('/', (req, res) => {
  const {
    title,
    problem,
    resolution,
    machine_model,
    ticket_date,
    category_id,
    tags,
    related_document_ids,
  } = req.body;

  if (!title || !problem) {
    return res.status(400).json({ error: 'title and problem are required' });
  }

  const categoryId = category_id || getCategoryIdByName('Tickets/Support Cases');

  const insertTx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO tickets (title, problem, resolution, machine_model, ticket_date, category_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(title, problem, resolution || null, machine_model || null, ticket_date || null, categoryId);

    const ticketId = info.lastInsertRowid;

    if (tags) {
      const tagNames = Array.isArray(tags) ? tags : String(tags).split(',');
      const tagIds = upsertTags(tagNames);
      const linkTag = db.prepare(
        'INSERT OR IGNORE INTO ticket_tags (ticket_id, tag_id) VALUES (?, ?)'
      );
      for (const tagId of tagIds) linkTag.run(ticketId, tagId);
    }

    if (Array.isArray(related_document_ids)) {
      const linkDoc = db.prepare(
        'INSERT OR IGNORE INTO document_ticket_links (document_id, ticket_id) VALUES (?, ?)'
      );
      for (const documentId of related_document_ids) linkDoc.run(documentId, ticketId);
    }

    reindexFts({
      type: 'ticket',
      refId: ticketId,
      title,
      tags: getTicketTags(ticketId).join(' '),
      body: `${problem}\n${resolution || ''}\n${machine_model || ''}`,
    });

    return ticketId;
  });

  const ticketId = insertTx();
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
  res.status(201).json(serializeTicket(ticket));
});

ticketsRouter.patch('/:id', (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'not found' });

  const {
    title,
    problem,
    resolution,
    machine_model,
    ticket_date,
    category_id,
    tags,
    related_document_ids,
  } = req.body;

  const updateTx = db.transaction(() => {
    db.prepare(
      `UPDATE tickets SET
         title = COALESCE(?, title),
         problem = COALESCE(?, problem),
         resolution = COALESCE(?, resolution),
         machine_model = COALESCE(?, machine_model),
         ticket_date = COALESCE(?, ticket_date),
         category_id = COALESCE(?, category_id)
       WHERE id = ?`
    ).run(
      title ?? null,
      problem ?? null,
      resolution ?? null,
      machine_model ?? null,
      ticket_date ?? null,
      category_id ?? null,
      ticket.id
    );

    if (tags !== undefined) {
      db.prepare('DELETE FROM ticket_tags WHERE ticket_id = ?').run(ticket.id);
      const tagNames = Array.isArray(tags) ? tags : String(tags).split(',');
      const tagIds = upsertTags(tagNames);
      const linkTag = db.prepare(
        'INSERT OR IGNORE INTO ticket_tags (ticket_id, tag_id) VALUES (?, ?)'
      );
      for (const tagId of tagIds) linkTag.run(ticket.id, tagId);
    }

    if (related_document_ids !== undefined) {
      db.prepare('DELETE FROM document_ticket_links WHERE ticket_id = ?').run(ticket.id);
      const linkDoc = db.prepare(
        'INSERT OR IGNORE INTO document_ticket_links (document_id, ticket_id) VALUES (?, ?)'
      );
      for (const documentId of related_document_ids) linkDoc.run(documentId, ticket.id);
    }

    const updated = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticket.id);
    reindexFts({
      type: 'ticket',
      refId: ticket.id,
      title: updated.title,
      tags: getTicketTags(ticket.id).join(' '),
      body: `${updated.problem}\n${updated.resolution || ''}\n${updated.machine_model || ''}`,
    });
  });

  updateTx();
  const updated = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticket.id);
  res.json(serializeTicket(updated));
});

ticketsRouter.delete('/:id', (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'not found' });
  db.prepare('DELETE FROM tickets WHERE id = ?').run(ticket.id);
  removeFromFts('ticket', ticket.id);
  res.status(204).end();
});
