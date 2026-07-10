import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3002);
const LEGACY_FRAGMENTS_PATH = path.join(__dirname, 'data', 'fragments-academic.json');
const MASK_LIBRARY_PATH = path.join(__dirname, 'data', 'mask-library.json');
const FRAGMENT_IMAGE_MAPPING_PATH = path.join(__dirname, 'data', 'fragment-image-mapping.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

async function loadJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function loadLegacyFragments() {
  return loadJson(LEGACY_FRAGMENTS_PATH);
}

async function loadMaskLibrary() {
  return loadJson(MASK_LIBRARY_PATH);
}

async function loadFragmentImageMapping() {
  return loadJson(FRAGMENT_IMAGE_MAPPING_PATH);
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.svg') return 'image/svg+xml; charset=utf-8';
  return 'application/octet-stream';
}

async function trySendStaticAsset(url, res) {
  if (!url.pathname.startsWith('/assets/')) return false;
  const decodedPath = decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, decodedPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: 'forbidden' });
    return true;
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, {
      'content-type': contentTypeFor(filePath),
      'access-control-allow-origin': '*'
    });
    res.end(body);
  } catch {
    sendJson(res, 404, { error: 'asset not found' });
  }
  return true;
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

    if (req.method === 'GET' && url.pathname === '/api/health') {
      const maskLibrary = await loadMaskLibrary();
      sendJson(res, 200, {
        ok: true,
        maskLibrary: maskLibrary.version,
        prototypeMasks: maskLibrary.prototypeMasks.length,
        motifs: maskLibrary.motifLibrary.length
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/fragment-image-mapping') {
      const mapping = await loadFragmentImageMapping();
      sendJson(res, 200, {
        version: mapping.version,
        updatedAt: mapping.updatedAt,
        purpose: mapping.purpose,
        sourceRoot: mapping.sourceRoot,
        prototypeMasks: mapping.prototypeMasks,
        fragmentSets: mapping.fragmentSets.map(set => ({
          id: set.id,
          folderName: set.folderName,
          sourceFolder: set.sourceFolder,
          completeImage: set.completeImage,
          selectableFragmentCount: set.selectableFragments.length,
          availablePartKeys: set.availablePartKeys,
          missingExpectedPartKeys: set.missingExpectedPartKeys,
          bindToPrototypeMaskIdTodo: set.bindToPrototypeMaskIdTodo
        })),
        motifSelection: mapping.motifSelection,
        aiInputMapping: mapping.aiInputMapping
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/fragment-image-mapping/prototypes') {
      const mapping = await loadFragmentImageMapping();
      sendJson(res, 200, mapping.prototypeMasks);
      return;
    }

    const fragmentSetMatch = url.pathname.match(/^\/api\/fragment-image-mapping\/sets\/([^/]+)$/);
    if (req.method === 'GET' && fragmentSetMatch) {
      const mapping = await loadFragmentImageMapping();
      const item = mapping.fragmentSets.find(set => set.id === fragmentSetMatch[1] || set.folderName === fragmentSetMatch[1]);
      if (!item) {
        sendJson(res, 404, { error: 'fragment set not found' });
        return;
      }
      sendJson(res, 200, item);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/mask-library') {
      const maskLibrary = await loadMaskLibrary();
      sendJson(res, 200, {
        version: maskLibrary.version,
        updatedAt: maskLibrary.updatedAt,
        workflow: maskLibrary.workflow,
        assetConventions: maskLibrary.assetConventions,
        prototypeMasks: maskLibrary.prototypeMasks.map(mask => ({
          id: mask.id,
          displayNameCn: mask.displayNameCn,
          displayNameEn: mask.displayNameEn,
          artifactType: mask.artifactType,
          fullImage: mask.fullImage,
          fragmentCount: mask.fragments.length
        })),
        motifLibrary: maskLibrary.motifLibrary,
        generationRequestSchema: maskLibrary.generationRequestSchema
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/mask-library/motifs') {
      const maskLibrary = await loadMaskLibrary();
      sendJson(res, 200, maskLibrary.motifLibrary);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/mask-library/generation-schema') {
      const maskLibrary = await loadMaskLibrary();
      sendJson(res, 200, maskLibrary.generationRequestSchema);
      return;
    }

    const maskFragmentsMatch = url.pathname.match(/^\/api\/mask-library\/masks\/([^/]+)\/fragments$/);
    if (req.method === 'GET' && maskFragmentsMatch) {
      const maskLibrary = await loadMaskLibrary();
      const item = maskLibrary.prototypeMasks.find(mask => mask.id === maskFragmentsMatch[1]);
      if (!item) {
        sendJson(res, 404, { error: 'prototype mask not found' });
        return;
      }
      sendJson(res, 200, item.fragments);
      return;
    }

    const maskMatch = url.pathname.match(/^\/api\/mask-library\/masks\/([^/]+)$/);
    if (req.method === 'GET' && maskMatch) {
      const maskLibrary = await loadMaskLibrary();
      const item = maskLibrary.prototypeMasks.find(mask => mask.id === maskMatch[1]);
      if (!item) {
        sendJson(res, 404, { error: 'prototype mask not found' });
        return;
      }
      sendJson(res, 200, item);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/fragments') {
      const db = await loadLegacyFragments();
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

    const academicMatch = url.pathname.match(/^\/api\/fragments\/([^/]+)\/academic$/);
    if (req.method === 'GET' && academicMatch) {
      const db = await loadLegacyFragments();
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

    const fragmentMatch = url.pathname.match(/^\/api\/fragments\/([^/]+)$/);
    if (req.method === 'GET' && fragmentMatch) {
      const db = await loadLegacyFragments();
      const item = db.fragments.find(fragment => fragment.id === fragmentMatch[1]);
      if (!item) {
        sendJson(res, 404, { error: 'fragment not found' });
        return;
      }
      sendJson(res, 200, item);
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Sanxingdui mask database API: http://127.0.0.1:${PORT}`);
});