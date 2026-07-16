import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'bible.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Two partial indexes because SQLite treats every NULL as distinct, so a
-- plain UNIQUE(name, parent_id) would not dedupe top-level (parent_id IS NULL) categories.
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_unique_top_level
  ON categories(name) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_unique_nested
  ON categories(name, parent_id) WHERE parent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  mime_type TEXT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  category_suggested INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  extracted_text TEXT,
  version_number INTEGER NOT NULL DEFAULT 1,
  original_document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  is_current INTEGER NOT NULL DEFAULT 1,
  date_added TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS document_tags (
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, tag_id)
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  problem TEXT NOT NULL,
  resolution TEXT,
  machine_model TEXT,
  ticket_date TEXT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  date_added TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ticket_tags (
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (ticket_id, tag_id)
);

CREATE TABLE IF NOT EXISTS document_ticket_links (
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, ticket_id)
);

CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
  type UNINDEXED,
  ref_id UNINDEXED,
  title,
  tags,
  body,
  tokenize = 'porter'
);
`);

// SQLite has no "ADD COLUMN IF NOT EXISTS", so guard manually — needed for databases
// created before the knowledge-graph feature existed.
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
// graph_data holds the JSON output of the local entity/relationship extraction
// pipeline (see graph/extract.js), recomputed only on write, not on every search.
ensureColumn('documents', 'graph_data', 'graph_data TEXT');
ensureColumn('tickets', 'graph_data', 'graph_data TEXT');

const DEFAULT_CATEGORIES = [
  'Alarms & Diagnostics',
  'Maintenance',
  'Programming',
  'Wiring',
  'Networking',
  'MTConnect / Options',
  'Testing / Sanity Checks',
  'Tickets/Support Cases',
  'Parts',
  'Uncategorized',
];

const insertCategory = db.prepare(
  'INSERT OR IGNORE INTO categories (name, parent_id) VALUES (?, NULL)'
);
const seedCategories = db.transaction((names) => {
  for (const name of names) insertCategory.run(name);
});
seedCategories(DEFAULT_CATEGORIES);

export function getCategoryIdByName(name) {
  const row = db.prepare('SELECT id FROM categories WHERE name = ? AND parent_id IS NULL').get(name);
  return row ? row.id : null;
}

export function upsertTags(names) {
  const insert = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
  const select = db.prepare('SELECT id FROM tags WHERE name = ?');
  const ids = [];
  for (const raw of names) {
    const name = raw.trim().toLowerCase();
    if (!name) continue;
    insert.run(name);
    ids.push(select.get(name).id);
  }
  return ids;
}

export function reindexFts({ type, refId, title, tags, body }) {
  db.prepare('DELETE FROM search_fts WHERE type = ? AND ref_id = ?').run(type, refId);
  db.prepare(
    'INSERT INTO search_fts (type, ref_id, title, tags, body) VALUES (?, ?, ?, ?, ?)'
  ).run(type, refId, title || '', tags || '', body || '');
}

export function removeFromFts(type, refId) {
  db.prepare('DELETE FROM search_fts WHERE type = ? AND ref_id = ?').run(type, refId);
}
