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
8. **Insights dashboard** — a second results tab (alongside "Documents") that turns the
   people, companies, technologies, parts, alarms, software, locations, dates, and events found
   across your matching documents/tickets into a structured knowledge dashboard (with timeline,
   concept-cluster, and scoped connection views). See "Insights dashboard" below.

## Insights dashboard

Every search has a second tab, "Insights", next to "Documents". It's built entirely from a
local, offline extraction pipeline — **no API calls, no LLM, no per-search cost**:

- **Entity extraction** uses [`compromise`](https://github.com/spencermountain/compromise) (a
  local JS NLP library) to find people, companies/organizations, places, and dates, plus a
  custom Hurco/CNC term dictionary (`backend/src/graph/domainDictionary.js`) for domain
  vocabulary generic NLP doesn't know — WinMax, MTConnect, EtherCAT, NavErr, servo faults,
  G-code, etc. Add your own terms to that file any time; no other code changes needed.
- **Relationships** are paragraph-level co-occurrence: two entities mentioned in the same
  paragraph (or ~3-sentence chunk, for short ticket fields) get an edge, weighted by how often
  that pairing recurs, with the actual excerpt(s) kept as citations.
- **Keyword ranking** (a small RAKE-style implementation, `backend/src/graph/extract.js`) scores
  which terms matter most in a document; matches feed into node "importance" alongside raw
  mention count.
- **Events** are a simple heuristic: any sentence containing both a date-like token and a known
  action verb (replaced, installed, failed, diagnosed, etc.) becomes its own node, linked to
  whichever entities that sentence also mentions.

This all runs once, when a document/ticket is added or edited (`graph_data` column, computed by
`backend/src/graph/store.js`), not on every search — searching just merges the already-computed
per-document data for whichever documents/tickets matched. Stored extraction data is versioned:
whenever the extraction rules or dictionary change, the backend re-extracts your whole library
automatically on the next startup, so tuning fixes reach existing documents with no manual step.

The Insights tab presents that data as structured views (an earlier iteration used a full
force-directed node graph; it became an unreadable hairball as entity counts grew, so it was
replaced — a scoped remnant of it survives as the Entity Explorer below):

- **Knowledge Dashboard** (default) — an executive summary (templated locally from the top
  entities, categories, and strongest co-occurrence — not an LLM), then one card per entity
  category (People, Companies, Technologies, Software, Parts & Products, Risks/Issues, Events,
  Locations, Dates — empty sections are hidden) with entities ranked by importance, plus a
  Concepts card of top keyword phrases and a Supporting Evidence section of source excerpts.
  Clicking any entity expands it in place: which documents/tickets it appears in, the supporting
  excerpts, and its most related entities as a ranked horizontal bar list — each related entity
  clickable to jump to its own expanded view.
- **Timeline view** — offered when enough dated items/events exist (and becomes the default when
  results are strongly date-driven): matched dates and events in chronological order, each with
  its excerpt and source link; relative mentions ("Tuesday") group at the bottom.
- **Concept Clusters view** — offered when the results are concept-heavy: technologies, software,
  parts, and faults grouped into tiles by co-occurrence (terms that keep showing up in the same
  paragraphs cluster together), each chip clickable through to the dashboard entry.
- **Entity Explorer** — the only node/edge visual left, and it never shows the full graph: it
  opens only when you click "Show connections" on an entity, scoped to that entity plus its
  direct neighbors. Node size = importance, edge thickness = co-occurrence strength; clicking
  a node opens its detail panel, clicking an edge shows the excerpts behind that relationship.

If a search doesn't turn up enough structured detail for a useful dashboard, the tab shows a
short note and falls back to the same library list as the Documents tab.

**On accuracy**: this is heuristic pattern-matching, not real language understanding, so expect
occasional noise — a few known false positives from the generic NLP pass (e.g. a document title
fragment like "Licensing & Troubleshooting" or "DigiCert High Assurance" getting mistagged as a
company name). If you spot a bad extraction, the fix is almost always either adding a term to
`domainDictionary.js` (so it wins over the generic guess) or adding a short exclusion in
`extract.js` the same way the existing `ORG_FALSE_POSITIVES` list handles a couple of short
tech-abbreviation false positives.

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

The main content area has a faint, centered Hurco logo watermark (a dark scrim over the logo
keeps it at roughly 10% visibility, fixed in place as you scroll). The logo image itself isn't
committed to this public repo — see `frontend/public/README-assets.md` for where to put your
own copy locally. Without it, the page just shows the plain dark background as before.

## Desktop app (Windows installer)

The app can be packaged as a self-contained Electron desktop application — one installed
program that starts its own backend internally and opens straight into the UI. No terminals,
no browser, no ports to remember.

**One-time setup** (on the machine doing the build):

```bash
cd desktop && npm install
```

Electron's install step downloads its runtime binary via a postinstall script, so if your npm
blocks install scripts you'll need to approve them (same `npm approve-scripts` +
`npm rebuild electron` dance as `better-sqlite3` needed in `backend/`).

**Optional — app icon**: drop a square (256×256 or larger) PNG of the Hurco logo at
`desktop/build/icon.png` before building. Like the watermark image, the icon is intentionally
gitignored (real brand asset, public repo); without it the build just uses Electron's default
icon.

**Build the installer:**

```bash
cd hurco-sse-bible
npm run build:desktop
```

This builds the frontend, stages it plus the backend source into `desktop/`, and produces a
Windows NSIS installer at `desktop/release/Hurco SSE Bible Setup <version>.exe`. Run that file
to install; it creates Start Menu/desktop shortcuts like any normal program. (Mac/Linux targets
are a config line away in `desktop/package.json` — currently Windows-only.)

**Where the desktop app keeps data**: `%APPDATA%\Hurco SSE Bible\` (`data\bible.db` +
`uploads\`), NOT the install directory — documents and tickets survive app updates and
reinstalls. On first run with an empty library it auto-loads the built-in Hurco seed content.
To carry over a library you built running in web/dev mode, quit the app and copy
`backend\data\bible.db` into `%APPDATA%\Hurco SSE Bible\data\` and the contents of
`backend\uploads\` into `%APPDATA%\Hurco SSE Bible\uploads\`.

**Dev workflow is unchanged**: `npm run dev` in `backend/` + `frontend/` still runs the app in
the browser exactly as before — the desktop packaging is purely additive. (For a quick
desktop-shell test without building an installer: build the frontend, then `cd desktop &&
npm start`.)

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
    routes/         documents, tickets, categories, search (search/graph = knowledge graph)
    graph/          extract.js (local NLP pipeline), aggregate.js (per-search merge),
                    store.js (compute/backfill graph_data), domainDictionary.js (CNC terms)
  uploads/          Uploaded files live here (gitignored)
  data/             SQLite DB lives here (gitignored)
frontend/
  src/
    App.jsx         Top-level layout/view state
    components/      Sidebar, SearchBar, SearchResults, DocumentDetail, TicketDetail,
                      TicketForm, AddDocumentModal, AddCategoryModal, CategoryBrowse, Highlighted,
                      KnowledgeDashboard (Insights views), KnowledgeGraph (scoped Entity
                      Explorer), entityCategories (shared color/label maps), LocalResultsList
desktop/
  main.js           Electron shell: boots the backend in-process, opens the window
  loading.html      Splash shown while the embedded server starts
  prep.js           Copies backend src + frontend dist in before packaging
  package.json      Electron + electron-builder config (Windows NSIS installer)
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
