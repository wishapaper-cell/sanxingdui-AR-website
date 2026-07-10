import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3002);
const DATA_PATH = path.join(__dirname, 'data', 'fragments-academic.json');

async function loadDatabase() {
  const raw = await readFile(DATA_PATH, 'utf8');
  return JSON.parse(raw);
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,OPTIONS',
    'access-control-allow-headers': 'content-type'
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,OPTIONS',
        'access-control-allow-headers': 'content-type'
      });
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const db = await loadDatabase();

    if (req.method === 'GET' && url.pathname === '/api/health') {
      sendJson(res, 200, { ok: true, database: db.version, fragments: db.fragments.length });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/fragments') {
      sendJson(res, 200, db.fragments.map(({ id, displayName, theme, identity, power, asset }) => ({
        id,
        displayName,
        theme,
        identity,
        power,
        asset
      })));
      return;
    }

    const fragmentMatch = url.pathname.match(/^\/api\/fragments\/([^/]+)$/);
    if (req.method === 'GET' && fragmentMatch) {
      const item = db.fragments.find(fragment => fragment.id === fragmentMatch[1]);
      if (!item) {
        sendJson(res, 404, { error: 'fragment not found' });
        return;
      }
      sendJson(res, 200, item);
      return;
    }

    const academicMatch = url.pathname.match(/^\/api\/fragments\/([^/]+)\/academic$/);
    if (req.method === 'GET' && academicMatch) {
      const item = db.fragments.find(fragment => fragment.id === academicMatch[1]);
      if (!item) {
        sendJson(res, 404, { error: 'fragment not found' });
        return;
      }
      sendJson(res, 200, {
        id: item.id,
        displayName: item.displayName,
        academic: item.academic,
        references: item.references.map(refId => ({ id: refId, ...db.references[refId] }))
      });
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Sanxingdui academic database API: http://127.0.0.1:${PORT}`);
});