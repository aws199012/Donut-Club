# Hurco SSE Bible

A personal knowledge-base app for Hurco SSE: a searchable, browsable library of documents
(manuals, notes, wiring diagrams, etc.) and support tickets, organized by category and tag.
Local search always runs first and is labeled "From your library"; a web search fallback is
available and clearly labeled "From the web" so you always know where an answer came from.

Runs entirely on your own machine: SQLite for storage, a local `uploads/` folder for files.

## Stack

- **Backend**: Node.js + Express, `better-sqlite3` (SQLite with an FTS5 full-text index),
  `multer` for uploads, `pdf-parse`/`mammoth` for text extraction from PDFs/Word docs.
- **Frontend**: React + Vite.

## Setup

```bash
cd backend && npm install
cd ../frontend && npm install
```

Optional: copy `backend/.env.example` to `backend/.env` to set a custom port or a Bing Web
Search API key (see "Web search" below).

## Running

In two terminals:

```bash
cd backend && npm run dev     # http://localhost:4000
cd frontend && npm run dev    # http://localhost:5173
```

Open http://localhost:5173. The Vite dev server proxies `/api` and `/uploads` to the backend.

The SQLite database is created at `backend/data/bible.db` on first run, seeded with default
categories (Alarms & Errors, Maintenance, Programming, Wiring, Tickets/Support Cases, Parts,
Uncategorized). Uploaded files are stored in `backend/uploads/`.

## Features (MVP)

1. **Document upload** — drag-and-drop or click to browse, with a quick tagging step.
   Text is extracted from PDF/DOCX/TXT/MD files for search and auto-categorization.
2. **Auto-categorization** — a keyword-based suggestion assigns a category on upload; you can
   always re-file or re-tag from the document detail view. A category picked automatically
   is marked "auto-suggested".
3. **Versioning** — when uploading, you can mark a file as replacing an existing document.
   The old version is kept (not duplicated) and the document detail view shows version history.
4. **Local search** — full-text search (SQLite FTS5) over document text/titles/tags and ticket
   problem/resolution/machine fields. Always shown first, labeled "From your library".
5. **Web search fallback** — a separate, explicitly-labeled "From the web" section. You choose
   when to run it (a prompt appears automatically if local results are thin).
6. **Category browsing** — a collapsible sidebar tree, like a wiki table of contents.
7. **Tickets** — their own entry type: problem, resolution, machine/model, date, tags, and
   links to related documents (and vice versa from the document view).

## Web search

By default, "From the web" uses a keyless scrape of DuckDuckGo's HTML endpoint — no API key
needed, but not guaranteed to be reliable everywhere (some networks/IPs get rate-limited or
served an interstitial page instead of results). For dependable results, set `BING_SEARCH_KEY`
in `backend/.env` to your Bing Web Search API key; the app will use that instead.

## Project layout

```
backend/
  src/
    server.js       Express app + route wiring
    db.js           SQLite schema, FTS index helpers
    categorize.js   Keyword-based category suggestion
    textExtract.js  PDF/DOCX/TXT text extraction
    websearch.js    Pluggable web search (DuckDuckGo scrape or Bing API)
    routes/         documents, tickets, categories, search
  uploads/          Uploaded files live here (gitignored)
  data/             SQLite DB lives here (gitignored)
frontend/
  src/
    App.jsx         Top-level layout/view state
    components/      Sidebar, SearchBar, SearchResults, DocumentDetail, TicketDetail,
                      TicketForm, AddDocumentModal, CategoryBrowse, Highlighted
```

## Known limitations / next steps

- Auto-categorization is keyword-based, not ML-based — it's a starting suggestion, not a
  guarantee. Re-file freely.
- No authentication — this is meant to run locally for a single user.
- The DuckDuckGo web search fallback can be blocked/rate-limited on some networks; a Bing key
  is the more reliable option if you rely on the web fallback often.
- No nested-category UI yet (the data model supports `parent_category`, but the sidebar/API
  only exercise flat top-level categories in this MVP).
