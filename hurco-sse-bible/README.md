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
categories (Alarms & Diagnostics, Maintenance, Programming, Wiring, Networking,
MTConnect / Options, Testing / Sanity Checks, Tickets/Support Cases, Parts, Uncategorized).
Uploaded files are stored in `backend/uploads/`.

## Seed content

```bash
cd backend && npm run seed
```

Loads prior Hurco SSE technical discussions (networking setup, a Delta spindle NavErr
analysis, a threading-block parameter issue, MTConnect/Ultimonitor licensing, and sanity-check
references) as documents and tickets, cross-linked and tagged. Safe to re-run — it skips any
title that already exists.

Several entries reference full source documents (`Hurco_Network_Guide.docx`,
`MTConnect_Adapter_Setup_and_Troubleshooting.docx`, `Full_System_Software_Sanity_Check_2_0.docx`,
the WinMax Mill User Guide PDF) that weren't available to seed directly, so those are created as
placeholder documents containing the summarized notes. Once you have the real files, upload each
one via "Add Document" → "This replaces an existing document" → select the matching placeholder.
Superseding a document now inherits its category and tags automatically (unless you override
them), and any tickets already linked to the placeholder stay linked to the new version — so
replacing a placeholder doesn't create a duplicate or break existing cross-references.

## Features (MVP)

1. **Document upload** — drag-and-drop or click to browse, with a quick tagging step. Select
   or drop multiple files at once; each is processed and filed as its own independent document
   (its own extracted text, its own auto-suggested category/tags), with a per-file
   pending/uploading/success/error status so a batch drop is easy to audit. Text is extracted
   from PDF/DOCX/TXT/MD files for search and auto-categorization.
2. **Auto-categorization** — a keyword-based suggestion assigns a category on upload; you can
   always re-file or re-tag from the document detail view. A category picked automatically
   is marked "auto-suggested".
3. **Versioning** — when uploading, you can mark a file as replacing an existing document.
   The old version is kept (not duplicated) and the document detail view shows version history.
4. **Local search** — full-text search (SQLite FTS5) over document text/titles/tags and ticket
   problem/resolution/machine fields. Always shown first, labeled "From your library".
5. **Web search fallback** — a separate, explicitly-labeled "From the web" section. You choose
   when to run it (a prompt appears automatically if local results are thin).
6. **Category browsing** — a sidebar tree, like a wiki table of contents. Create new top-level
   or nested categories from the sidebar's "+ new" link.
7. **Tickets** — their own entry type: problem, resolution, machine/model, date, tags, and
   links to related documents (and vice versa from the document view).

## Look & feel

Dark, Hurco-brand colorway (near-black background with a subtle red glow, cyan reserved for
the "From the web" label). The sidebar's category buttons use a shared `.category-pixel-button`
CSS class — a retro/arcade look (notched corners, red/blue/green bevel matched per button color,
offset drop shadow, "Press Start 2P" pixel font, a breathing text pulse, a pressed-down look
when selected). Every category — seeded, nested, or created via the sidebar's "+ new" link —
renders through the same component, so new categories automatically pick up the styling with no
extra work.

General app text (headers, titles, buttons other than category buttons) uses "Bungee", a bold
vintage/diner-poster display font; body copy (metadata, tags, extracted text, form fields) uses
"Nunito", a warmer but still highly readable complementary font. The category pixel buttons are
untouched by this — they keep their own "Press Start 2P" font regardless.

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
    seed.js         Loads the built-in Hurco SSE seed content (see "Seed content" above)
    routes/         documents, tickets, categories, search
  uploads/          Uploaded files live here (gitignored)
  data/             SQLite DB lives here (gitignored)
frontend/
  src/
    App.jsx         Top-level layout/view state
    components/      Sidebar, SearchBar, SearchResults, DocumentDetail, TicketDetail,
                      TicketForm, AddDocumentModal, AddCategoryModal, CategoryBrowse, Highlighted
```

## Known limitations / next steps

- **Redacted service password**: this repo is public, so the seed script replaces the literal
  Hurco service password (used for machine file-explorer/service access) with a placeholder
  string. If you want the real value indexed for search, edit `backend/src/seed.js` locally
  (don't commit the change) or add it as a private note after seeding.
- Auto-categorization is keyword-based, not ML-based — it's a starting suggestion, not a
  guarantee. Re-file freely.
- No authentication — this is meant to run locally for a single user.
- The DuckDuckGo web search fallback can be blocked/rate-limited on some networks; a Bing key
  is the more reliable option if you rely on the web fallback often.
- Nested categories go one level deep (a category's parent must itself be top-level) — matches
  what the sidebar renders; deeper trees would need sidebar changes too.
