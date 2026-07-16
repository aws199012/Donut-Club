// Electron shell: boots the existing Express backend in-process (same Node
// runtime — no separate server to start), then points the window at it. The
// SQLite DB and uploads live under the per-user data folder
// (app.getPath('userData')), NOT the install directory, so documents survive app
// updates and reinstalls.
import { app, BrowserWindow, Menu, dialog, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// A second launch focuses the existing window instead of racing the first
// instance for the same database.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const isPackaged = app.isPackaged;

// Packaged: prep.js copied the backend source and built frontend next to this
// file. Unpackaged (npx electron . from desktop/): use the live sibling folders —
// same code, no copy step, for quick desktop-shell testing.
const backendDir = isPackaged
  ? path.join(__dirname, 'bundled-backend', 'src')
  : path.join(__dirname, '..', 'backend', 'src');
const frontendDist = isPackaged
  ? path.join(__dirname, 'frontend-dist')
  : path.join(__dirname, '..', 'frontend', 'dist');

let win = null;

async function start() {
  await app.whenReady();
  Menu.setApplicationMenu(null);

  const userData = app.getPath('userData');
  process.env.DB_PATH = path.join(userData, 'data', 'bible.db');
  process.env.UPLOAD_DIR = path.join(userData, 'uploads');
  process.env.FRONTEND_DIST = frontendDist;

  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b0a0a',
    autoHideMenuBar: true,
  });

  // Web-search results (and any other external links) open in the system
  // browser, never inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Simple splash while the server boots, so the first launch is never a blank
  // window (native module load + first-run extraction can take a moment).
  await win.loadFile(path.join(__dirname, 'loading.html'));

  try {
    const firstRun = !fs.existsSync(process.env.DB_PATH);

    // Env vars must be set before this import: db.js reads DB_PATH and the
    // routes read UPLOAD_DIR at module load.
    const backend = await import(pathToFileURL(path.join(backendDir, 'server.js')).href);
    const { port } = await backend.startServer({ port: 0 });

    if (firstRun) {
      // Brand-new library: load the built-in Hurco seed content so the app
      // doesn't open empty. Idempotent, so a failure here is non-fatal.
      try {
        await import(pathToFileURL(path.join(backendDir, 'seed.js')).href);
      } catch (err) {
        console.error('First-run seed failed (continuing without it):', err);
      }
    }

    await win.loadURL(`http://127.0.0.1:${port}/`);
  } catch (err) {
    dialog.showErrorBox(
      'Hurco SSE Bible failed to start',
      String(err?.stack || err)
    );
    app.quit();
  }
}

start();

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('window-all-closed', () => app.quit());
