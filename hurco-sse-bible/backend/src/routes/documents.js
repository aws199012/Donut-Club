import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { v4 as uuidv4 } from 'uuid';
import { db, upsertTags, reindexFts, removeFromFts, getCategoryIdByName } from '../db.js';
import { extractText } from '../textExtract.js';
import { suggestCategory } from '../categorize.js';
import { computeDocumentGraph } from '../graph/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

export const documentsRouter = Router();

function getDocumentTags(documentId) {
  return db
    .prepare(
      `SELECT t.name FROM tags t
       JOIN document_tags dt ON dt.tag_id = t.id
       WHERE dt.document_id = ?`
    )
    .all(documentId)
    .map((r) => r.name);
}

function getLinkedTickets(documentId) {
  return db
    .prepare(
      `SELECT tk.id, tk.title FROM tickets tk
       JOIN document_ticket_links l ON l.ticket_id = tk.id
       WHERE l.document_id = ?`
    )
    .all(documentId);
}

function serializeDocument(doc) {
  return {
    ...doc,
    tags: getDocumentTags(doc.id),
    related_tickets: getLinkedTickets(doc.id),
  };
}

documentsRouter.get('/', (req, res) => {
  const docs = db
    .prepare('SELECT * FROM documents WHERE is_current = 1 ORDER BY date_added DESC')
    .all();
  res.json(docs.map(serializeDocument));
});

documentsRouter.get('/:id', (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'not found' });

  const versions = db
    .prepare(
      `SELECT id, version_number, date_added, is_current FROM documents
       WHERE id = ? OR original_document_id = ? OR id = (
         SELECT COALESCE(original_document_id, id) FROM documents WHERE id = ?
       )
       ORDER BY version_number ASC`
    )
    .all(doc.id, doc.original_document_id || doc.id, doc.id);

  res.json({ ...serializeDocument(doc), versions });
});

documentsRouter.post('/', upload.single('file'), async (req, res) => {
  const file = req.file;
  const { title, tags, category_id, notes, supersedes_document_id } = req.body;

  if (!file) return res.status(400).json({ error: 'file is required' });

  const extractedText = await extractText(file.path, file.mimetype);
  const docTitle = title?.trim() || file.originalname;

  const supersedesId = supersedes_document_id ? Number(supersedes_document_id) : null;
  const previous = supersedesId
    ? db.prepare('SELECT * FROM documents WHERE id = ?').get(supersedesId)
    : null;

  // Replacing a document (e.g. swapping a placeholder for the real manual) should
  // continue its filing, not start from scratch — inherit category/tags unless the
  // caller explicitly overrides them.
  let categoryId = category_id ? Number(category_id) : null;
  let categorySuggested = 0;
  if (!categoryId && previous) {
    categoryId = previous.category_id;
    categorySuggested = previous.category_suggested;
  } else if (!categoryId) {
    const suggestedName = suggestCategory(docTitle, extractedText);
    categoryId = getCategoryIdByName(suggestedName);
    categorySuggested = 1;
  }

  const inheritTags = tags === undefined && previous ? getDocumentTags(previous.id) : null;

  let versionNumber = 1;
  let originalDocumentId = null;

  const insertTx = db.transaction(() => {
    if (previous) {
      originalDocumentId = previous.original_document_id || previous.id;
      versionNumber = previous.version_number + 1;
      db.prepare('UPDATE documents SET is_current = 0 WHERE id = ?').run(previous.id);
    }

    const info = db
      .prepare(
        `INSERT INTO documents
         (title, filename, filepath, mime_type, category_id, category_suggested, notes,
          extracted_text, version_number, original_document_id, is_current)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
      )
      .run(
        docTitle,
        file.originalname,
        path.relative(path.join(__dirname, '..', '..'), file.path),
        file.mimetype,
        categoryId,
        categorySuggested,
        notes || null,
        extractedText,
        versionNumber,
        originalDocumentId
      );

    const documentId = info.lastInsertRowid;

    if (previous) {
      // Carry ticket links forward so superseding a document (e.g. swapping in the
      // real manual for a placeholder) doesn't silently orphan existing tickets that
      // reference it — they point at whichever version is_current.
      const linkedTicketIds = db
        .prepare('SELECT ticket_id FROM document_ticket_links WHERE document_id = ?')
        .all(previous.id)
        .map((r) => r.ticket_id);
      const linkTicket = db.prepare(
        'INSERT OR IGNORE INTO document_ticket_links (document_id, ticket_id) VALUES (?, ?)'
      );
      for (const ticketId of linkedTicketIds) linkTicket.run(documentId, ticketId);
    }

    const tagNames = inheritTags || (tags ? (Array.isArray(tags) ? tags : String(tags).split(',')) : null);
    if (tagNames) {
      const tagIds = upsertTags(tagNames);
      const linkTag = db.prepare(
        'INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?, ?)'
      );
      for (const tagId of tagIds) linkTag.run(documentId, tagId);
    }

    reindexFts({
      type: 'document',
      refId: documentId,
      title: docTitle,
      tags: getDocumentTags(documentId).join(' '),
      body: extractedText,
    });

    computeDocumentGraph(documentId, `${docTitle}\n${notes || ''}\n${extractedText}`);

    return documentId;
  });

  const documentId = insertTx();
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId);
  res.status(201).json(serializeDocument(doc));
});

documentsRouter.patch('/:id', (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'not found' });

  const { title, category_id, notes, tags } = req.body;

  const updateTx = db.transaction(() => {
    db.prepare(
      `UPDATE documents SET
         title = COALESCE(?, title),
         category_id = COALESCE(?, category_id),
         category_suggested = CASE WHEN ? IS NOT NULL THEN 0 ELSE category_suggested END,
         notes = COALESCE(?, notes)
       WHERE id = ?`
    ).run(title ?? null, category_id ?? null, category_id ?? null, notes ?? null, doc.id);

    if (tags !== undefined) {
      db.prepare('DELETE FROM document_tags WHERE document_id = ?').run(doc.id);
      const tagNames = Array.isArray(tags) ? tags : String(tags).split(',');
      const tagIds = upsertTags(tagNames);
      const linkTag = db.prepare(
        'INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?, ?)'
      );
      for (const tagId of tagIds) linkTag.run(doc.id, tagId);
    }

    const updated = db.prepare('SELECT * FROM documents WHERE id = ?').get(doc.id);
    reindexFts({
      type: 'document',
      refId: doc.id,
      title: updated.title,
      tags: getDocumentTags(doc.id).join(' '),
      body: updated.extracted_text,
    });
    computeDocumentGraph(doc.id, `${updated.title}\n${updated.notes || ''}\n${updated.extracted_text || ''}`);
  });

  updateTx();
  const updated = db.prepare('SELECT * FROM documents WHERE id = ?').get(doc.id);
  res.json(serializeDocument(updated));
});

documentsRouter.delete('/:id', (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'not found' });

  const filePath = path.join(__dirname, '..', '..', doc.filepath);
  db.prepare('DELETE FROM documents WHERE id = ?').run(doc.id);
  removeFromFts('document', doc.id);
  fs.rm(filePath, { force: true }, () => {});
  res.status(204).end();
});
