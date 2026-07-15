import { Router } from 'express';
import { db } from '../db.js';

export const categoriesRouter = Router();

categoriesRouter.get('/', (req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
  const counts = db
    .prepare(
      `SELECT category_id, COUNT(*) AS count FROM documents WHERE is_current = 1 GROUP BY category_id`
    )
    .all();
  const ticketCounts = db
    .prepare(`SELECT category_id, COUNT(*) AS count FROM tickets GROUP BY category_id`)
    .all();

  const countMap = new Map();
  for (const row of counts) countMap.set(row.category_id, row.count);
  for (const row of ticketCounts) {
    countMap.set(row.category_id, (countMap.get(row.category_id) || 0) + row.count);
  }

  const withCounts = categories.map((cat) => ({
    ...cat,
    document_count: countMap.get(cat.id) || 0,
  }));

  res.json(withCounts);
});

categoriesRouter.post('/', (req, res) => {
  const { name, parent_id } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    const info = db
      .prepare('INSERT INTO categories (name, parent_id) VALUES (?, ?)')
      .run(name.trim(), parent_id || null);
    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(category);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

categoriesRouter.get('/:id/items', (req, res) => {
  const categoryId = Number(req.params.id);
  const documents = db
    .prepare(
      `SELECT id, title, date_added, version_number, 'document' AS item_type
       FROM documents WHERE category_id = ? AND is_current = 1 ORDER BY date_added DESC`
    )
    .all(categoryId);
  const tickets = db
    .prepare(
      `SELECT id, title, ticket_date, 'ticket' AS item_type
       FROM tickets WHERE category_id = ? ORDER BY date_added DESC`
    )
    .all(categoryId);
  res.json({ documents, tickets });
});
