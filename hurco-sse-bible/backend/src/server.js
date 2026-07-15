import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { documentsRouter } from './routes/documents.js';
import { ticketsRouter } from './routes/tickets.js';
import { categoriesRouter } from './routes/categories.js';
import { searchRouter } from './routes/search.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.use('/api/documents', documentsRouter);
app.use('/api/tickets', ticketsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/search', searchRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Hurco SSE Bible backend listening on http://localhost:${PORT}`);
});
