// Pre-build staging: copies the backend source and the built frontend into
// desktop/ so electron-builder packages everything from one folder. Run
// automatically by `npm run dist` — not needed for web dev.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
if (!fs.existsSync(path.join(frontendDist, 'index.html'))) {
  console.error(
    'frontend/dist not found — build the frontend first:\n' +
      '  cd ../frontend && npm run build\n' +
      '(or use `npm run build:desktop` from the hurco-sse-bible folder, which does both)'
  );
  process.exit(1);
}

function copyDir(from, to) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
  console.log(
    `copied ${path.relative(path.join(__dirname, '..'), from)} -> desktop/${path.relative(__dirname, to)}`
  );
}

copyDir(path.join(__dirname, '..', 'backend', 'src'), path.join(__dirname, 'bundled-backend', 'src'));
copyDir(frontendDist, path.join(__dirname, 'frontend-dist'));
