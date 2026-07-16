// Seeds the library with prior Hurco SSE technical discussions, per
// hurco-sse-bible-seed-content.md. Safe to re-run: skips any document/ticket
// whose title already exists.
//
// Run with: npm run seed
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v4 as uuidv4 } from 'uuid';
import { db, upsertTags, reindexFts, getCategoryIdByName } from './db.js';
import { computeDocumentGraph, computeTicketGraph } from './graph/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const SERVICE_PASSWORD_PLACEHOLDER = '[service password — see your internal records]';

function findDocumentByTitle(title) {
  return db.prepare('SELECT * FROM documents WHERE title = ? AND is_current = 1').get(title);
}

function findTicketByTitle(title) {
  return db.prepare('SELECT * FROM tickets WHERE title = ?').get(title);
}

function getDocumentTagNames(documentId) {
  return db
    .prepare(
      `SELECT t.name FROM tags t
       JOIN document_tags dt ON dt.tag_id = t.id
       WHERE dt.document_id = ?`
    )
    .all(documentId)
    .map((r) => r.name);
}

function seedDocument({ title, categoryName, tags, body, placeholderNote }) {
  const existing = findDocumentByTitle(title);
  if (existing) {
    console.log(`skip document (already exists): ${title}`);
    // Backfill graph_data for documents seeded before the knowledge-graph feature existed.
    if (!existing.graph_data) computeDocumentGraph(existing.id, `${title}\n${placeholderNote || ''}\n${body}`);
    return existing.id;
  }

  const categoryId = getCategoryIdByName(categoryName);
  const filename = `${title.replace(/[^a-z0-9]+/gi, '-')}.md`;
  const storedName = `${uuidv4()}.md`;
  const filepath = path.join(UPLOAD_DIR, storedName);
  fs.writeFileSync(filepath, body, 'utf-8');

  const insertTx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO documents
         (title, filename, filepath, mime_type, category_id, category_suggested, notes,
          extracted_text, version_number, original_document_id, is_current)
         VALUES (?, ?, ?, 'text/markdown', ?, 0, ?, ?, 1, NULL, 1)`
      )
      .run(title, filename, path.join('uploads', storedName), categoryId, placeholderNote, body);

    const documentId = info.lastInsertRowid;
    const tagIds = upsertTags(tags);
    const linkTag = db.prepare(
      'INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?, ?)'
    );
    for (const tagId of tagIds) linkTag.run(documentId, tagId);

    reindexFts({
      type: 'document',
      refId: documentId,
      title,
      tags: getDocumentTagNames(documentId).join(' '),
      body,
    });

    computeDocumentGraph(documentId, `${title}\n${placeholderNote || ''}\n${body}`);

    return documentId;
  });

  const documentId = insertTx();
  console.log(`seeded document: ${title}`);
  return documentId;
}

function seedTicket({
  title,
  categoryName,
  tags,
  problem,
  resolution,
  machineModel,
  relatedDocumentTitles,
}) {
  const existing = findTicketByTitle(title);
  if (existing) {
    console.log(`skip ticket (already exists): ${title}`);
    // Backfill graph_data for tickets seeded before the knowledge-graph feature existed.
    if (!existing.graph_data) {
      computeTicketGraph(existing.id, `${title}\n${problem}\n${resolution || ''}\n${machineModel || ''}`);
    }
    return existing.id;
  }

  const categoryId = getCategoryIdByName(categoryName);

  const insertTx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO tickets (title, problem, resolution, machine_model, ticket_date, category_id)
         VALUES (?, ?, ?, ?, NULL, ?)`
      )
      .run(title, problem, resolution || null, machineModel || null, categoryId);

    const ticketId = info.lastInsertRowid;
    const tagIds = upsertTags(tags);
    const linkTag = db.prepare(
      'INSERT OR IGNORE INTO ticket_tags (ticket_id, tag_id) VALUES (?, ?)'
    );
    for (const tagId of tagIds) linkTag.run(ticketId, tagId);

    if (relatedDocumentTitles?.length) {
      const linkDoc = db.prepare(
        'INSERT OR IGNORE INTO document_ticket_links (document_id, ticket_id) VALUES (?, ?)'
      );
      for (const docTitle of relatedDocumentTitles) {
        const doc = findDocumentByTitle(docTitle);
        if (doc) linkDoc.run(doc.id, ticketId);
      }
    }

    const tagNames = db
      .prepare(
        `SELECT t.name FROM tags t JOIN ticket_tags tt ON tt.tag_id = t.id WHERE tt.ticket_id = ?`
      )
      .all(ticketId)
      .map((r) => r.name);

    reindexFts({
      type: 'ticket',
      refId: ticketId,
      title,
      tags: tagNames.join(' '),
      body: `${problem}\n${resolution || ''}\n${machineModel || ''}`,
    });

    computeTicketGraph(ticketId, `${title}\n${problem}\n${resolution || ''}\n${machineModel || ''}`);

    return ticketId;
  });

  const ticketId = insertTx();
  console.log(`seeded ticket: ${title}`);
  return ticketId;
}

function placeholderHeader(realFilename) {
  return (
    `PLACEHOLDER DOCUMENT — the full "${realFilename}" has not been uploaded yet.\n` +
    `Once you have it, use "Add Document" → "This replaces an existing document" → select ` +
    `this entry, so the real file becomes v2 and keeps this category, tags, and ticket links.\n\n`
  );
}

// --- Networking -------------------------------------------------------

const networkGuideId = seedDocument({
  title: 'Hurco Network Setup & Troubleshooting Guide',
  categoryName: 'Networking',
  tags: ['networking', 'ethernet', 'wifi', 'domain', 'workgroup', 'ftp', 'drive-mapping', 'vpn'],
  placeholderNote: 'Placeholder for Hurco_Network_Guide.docx (not yet uploaded).',
  body:
    placeholderHeader('Hurco_Network_Guide.docx') +
    `Key verified facts (confirmed against official Hurco documentation):

- Hurco machines support both wired Ethernet and Wi-Fi.
- Wired Ethernet standard: IEEE 802.3 (confirmed in Hurco's official Maintenance Manual).
- Domain vs. Workgroup: Joining a domain is technically possible on a Hurco control, but not
  recommended — domain Group Policies can alter system settings in ways that cause
  unpredictable WinMax behavior or prevent the control from booting. Workgroup configuration
  is the recommended default; use domain only if your facility requires it and IT coordinates
  carefully around Group Policy exclusions for the control PC.
- Network scope is not required to be local-only. Shared drives and FTP hosts can be accessed
  across VLANs or routed networks, not just on the same local subnet.
- Drive mapping: map a network drive using the UNC path format \\\\ComputerName\\ShareName. Use
  "Reconnect at logon" so the mapping survives reboots. Use a static IP or consistent computer
  name for the file server — if the server's address changes, the mapping breaks. Test the
  mapped drive from Program Manager after setup.
- FTP: accessed via Input console key → Program Manager → FTP Manager. Add a host with an
  alias, IP address, login credentials (or prompt-each-time), a default remote directory, and
  a filename format (8.3 DOS vs. Long — note Long names still get truncated to 8.3 internally).
  Use static IPs for FTP hosts for reliability.
`,
});

seedTicket({
  title: 'Verifying Network Connectivity via Command Line',
  categoryName: 'Networking',
  tags: ['networking', 'ipconfig', 'troubleshooting', 'service-password'],
  problem:
    'How to check whether a Hurco control has a valid network/IP connection, and how to check ' +
    'general internet reachability (used for MTConnect/Ultimonitor licensing).',
  resolution: `To check network/IP connectivity:
1. Press the Hurco button (or Windows key), left arrow, then Run.
2. Enter the service password and type cmd, then OK.
3. Type ipconfig and press Enter.
4. Under the Local Area Connection section, confirm an IP address is shown (e.g. 192.168.x.x).
   If the address begins with 169.254, the machine does not have a valid network connection —
   resolve this before proceeding with any networked feature (MTConnect, FTP, drive mapping, etc).

To check general internet reachability instead (used for MTConnect/Ultimonitor licensing):
open iexplore and try navigating to a known-good site to confirm a page loads.`,
  relatedDocumentTitles: ['Hurco Network Setup & Troubleshooting Guide'],
});

// --- Alarms & Diagnostics ----------------------------------------------

seedTicket({
  title: 'Delta Spindle Drive Fault Analysis (NavErr Log)',
  categoryName: 'Alarms & Diagnostics',
  tags: ['spindle', 'delta-drive', 'ethercat', 'servo-fault', 'naverr'],
  machineModel: 'Delta spindle drive',
  problem:
    'Fault logged: ERROR.WRC: SERVO FAULT - SPINDLE ALARM during a tool change, with all axis ' +
    'servo amps disabled and the spindle stopped immediately, on a machine with a Delta spindle drive.',
  resolution: `Fault flags at capture: spindle fault signal active, spindle servo drive disabled, spindle
command stopped. No specific alarm code was returned from the drive itself over EtherCAT — a
known pattern when the fault happens very fast or comms drop at the same moment as the fault.

Spindle following error at capture was nearly a full revolution — meaning the spindle was not
tracking commanded speed at all when the fault hit (informational only in open-loop velocity
mode, but a strong symptom).

Leading up to the fault, the motion log showed the spindle repeatedly cycling
SUSPEND_FOR_DRIVE_DISABLED -> RESUME_FROM_DRIVE_DISABLED at ~12ms intervals — the control
detected the drive dropping in and out of ready state and tried to recover before finally
faulting.

Recurring ecatDcmGetStatus errors (EtherCAT Distributed Clock Master timing errors) were
present throughout — often benign on their own, but indicate communication jitter on the bus
worth noting when a real spindle fault also occurs.

Conclusion: this pointed to a true spindle drive fault (the Delta drive itself raising its
fault output) rather than a WinMax-side communication or following-error fault.

Good candidate for a "how to read a NavErr log for spindle faults" reference entry, plus a tag
for Delta-drive-specific machines since fault code reporting behavior differs by drive vendor.`,
});

// --- Programming ---------------------------------------------------------

seedTicket({
  title: 'Hurco Threading Block — Retract Before Z End Not Working',
  categoryName: 'Programming',
  tags: ['threading', 'turning', 'lathe', 'retract', 'winmax-parameter'],
  problem:
    'Setting "Retract Before Z End" to 20 revolutions in the threading cycle has no effect — ' +
    'the tool still runs to Z end and pulls out radially instead of tapering off early.',
  resolution: `Likely causes to check, in order:
1. Units/interpretation mismatch — the value is revolutions before Z end; on a fine pitch this
   may be a tiny Z distance in practice.
2. Not enough thread length — if total thread length (in revolutions) is close to or less than
   the retract value, there's no room to execute the retract and the control defaults to a hard
   pull-out.
3. Wrong parameter field — Z end, Z start, retract amount, and spring passes fields look similar
   and are easy to mix up.
4. Thread type/cycle mode — some WinMax versions only honor retract-before-Z-end on certain
   thread types (external vs internal, single-point vs tapping).
5. Version-specific bug — known quirks exist in some WinMax versions where this doesn't behave
   as documented; worth checking with Hurco support for your specific version.

Diagnostic: drop the retract value to 2-3 revolutions on a short thread and observe. If it
still dives to Z end, the parameter isn't being read (software/cycle-type issue). If 2-3 works
but 20 doesn't, the thread length simply can't accommodate 20 revolutions of retract.`,
});

// --- MTConnect / Options -------------------------------------------------

seedDocument({
  title: 'MTConnect Adapter Install, Licensing & Troubleshooting',
  categoryName: 'MTConnect / Options',
  tags: [
    'mtconnect',
    'ultimonitor',
    'opticlient',
    'licensing',
    'certificates',
    'winmax-09.01.290.01',
    'winmax-09.01.291',
  ],
  placeholderNote:
    'Placeholder for MTConnect_Adapter_Setup_and_Troubleshooting.docx (not yet uploaded).',
  body:
    placeholderHeader('MTConnect_Adapter_Setup_and_Troubleshooting.docx') +
    `- First-run internet requirement: the adapter must reach the internet on its first run to
  validate licensing certificates. After that initial connection, internet access is not
  required for normal operation.
- Verify it's running: open Internet Explorer on the machine and go to
  http://127.0.0.1:5000/current — a data page should display.
- Option activation (Ultimonitor): via OptiClient → Install tab → Select All → Request License
  Code(s) → Vendors tab → enter vendor number 0015 (not "15" — treated as a different entry and
  won't activate) with Permissions = Read → Add New Vendor → Pending tab → Save Pending File →
  email to Hurco for processing → apply the validated file once returned.
- On newer WinMax versions where Ultimonitor is no longer available, activate the MTConnect
  Support option instead, via the same general process.
- Pre-startup checklist before deeper troubleshooting:
  - Correct adapter package installed (x86 vs x64) for the OS architecture
  - WinMax version at minimum 09.01.290.01 or 09.01.291
  - OptiClient shows vendor ID "0015" installed correctly
  - System date/time accurate (Control Panel > Date/Time)
  - Valid internet connection present for first-time connection
- Wrong architecture package is the most common cause of adapter startup failure — commonly
  seen after an OS was upgraded from 32-bit to 64-bit (or vice versa) without reinstalling the
  matching adapter package.
- WCFDataService certificate issue: the adapter talks to WinMax internally via WCFDataService,
  which relies on SSL certificates. If missing/expired, the adapter can't initialize. Fix: open
  Certificate Manager (certmgr.msc via service password), Action > Find Certificates, search
  "DigiCert", and confirm these three are present — reimport any that are missing:
  - DigiCert Global Root CA
  - DigiCert High Assurance EV Root CA
  - DigiCert SHA2 Secure Server CA
- Accessing the machine file explorer: Hurco button → left arrow → Service → enter service
  password ${SERVICE_PASSWORD_PLACEHOLDER} → toggle Drive Access ON → Open Explorer → close the
  Service window (file explorer stays open).
`,
});

// --- Testing / Sanity Checks ----------------------------------------------

seedDocument({
  title: 'Full System Software Sanity Check 2.0',
  categoryName: 'Testing / Sanity Checks',
  tags: ['sanity-testing', 'mill', 'checklist', 'tool-management', 'spindle', 'nc-programming', 'network'],
  placeholderNote: 'Placeholder for Full_System_Software_Sanity_Check_2_0.docx (not yet uploaded).',
  body:
    placeholderHeader('Full_System_Software_Sanity_Check_2_0.docx') +
    `Sample NC test programs referenced as part of sanity testing: G81 drilling, G83 peck
drilling, M29+G84 rigid tapping, rectangular pocket milling with G41 cutter comp, G82
counterbore with dwell, G02/G03 circular contour with G42, and face milling passes.

Sanity-check expansion areas previously discussed: tool management/tool changer, spindle &
override controls, NC/conversational programming, and network/file transfer (USB, FTP, etc.)
— useful category cross-references for tagging test items against the same categories used
elsewhere in this app.
`,
});

seedDocument({
  title: 'Hurco WinMax Mill User Guide',
  categoryName: 'Testing / Sanity Checks',
  tags: ['mill', 'nc-programming', 'reference'],
  placeholderNote:
    'Placeholder for the full Hurco WinMax Mill User Guide PDF (~689 pages, not yet uploaded).',
  body:
    placeholderHeader('Hurco WinMax Mill User Guide (PDF, ~689 pages)') +
    'Full reference manual for WinMax mill programming and operation. Upload the real PDF to ' +
    'make its contents searchable.\n',
});

console.log('\nSeed complete.');
