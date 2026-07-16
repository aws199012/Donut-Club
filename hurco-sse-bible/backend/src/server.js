import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { documentsRouter } from './routes/documents.js';
import { ticketsRouter } from './routes/tickets.js';
import { categoriesRouter } from './routes/categories.js';
import { searchRouter } from './routes/search.js';
import { backfillGraphData } from './graph/store.js';

backfillGraphData();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Same env override the upload route uses — the desktop app points this at the
// per-user data folder so uploads live outside the install directory.
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));

app.use('/api/documents', documentsRouter);
app.use('/api/tickets', ticketsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/search', searchRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Desktop/production mode: serve the built frontend from this same server so the
// Electron window needs exactly one URL. Never active in web dev, where Vite
// serves the frontend and proxies /api here instead.
const FRONTEND_DIST = process.env.FRONTEND_DIST;
if (FRONTEND_DIST && fs.existsSync(path.join(FRONTEND_DIST, 'index.html'))) {
  app.use(express.static(FRONTEND_DIST));
  app.get('*', (req, res) => res.sendFile(path.join(FRONTEND_DIST, 'index.html')));
}

// Resolves once the server is accepting connections. port 0 asks the OS for any
// free port (the Electron shell does this to avoid colliding with anything);
// the actual port comes back in the result.
export function startServer({ port = Number(process.env.PORT) || 4000, host = '127.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => resolve({ server, port: server.address().port }));
    server.on('error', reject);
  });
}

// Auto-start only when this file is the entrypoint (npm run dev / npm start) —
// importing it as a module (the Electron shell does) must not grab a port as a
// side effect.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  startServer().then(({ port }) => {
    console.log(`Hurco SSE Bible backend listening on http://localhost:${port}`);
  });
}
