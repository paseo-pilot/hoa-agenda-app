const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'agenda.db');
const LEGACY_JSON_PATH = path.join(ROOT, '..', 'data', 'hoa-agenda', 'items.json');
const CLIENT_DIST = path.join(ROOT, 'client', 'dist');
const TOKEN_PATH = '/home/bot/.config/openclaw/ms-graph-token.json';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const TENANT_ID = process.env.MS_TENANT_ID || '';
const TOKEN_URL = TENANT_ID ? `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token` : '';
const CLIENT_ID = process.env.MS_CLIENT_ID || '';
const SP_HOST = process.env.VITE_SP_HOSTNAME || 'noodlebug.sharepoint.com';
const SP_SITE_PATH = process.env.VITE_SP_SITE_PATH || '/sites/ElPaseoHOA';
const SP_BACKEND_ROOT = process.env.HOA_AGENDA_SP_BACKEND_ROOT || 'General/OpenClaw Backend';
const SP_DOC_LIB_NAME = process.env.HOA_AGENDA_SP_DOC_LIB_NAME || 'HOA Agenda Documents';

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  meeting_date TEXT NOT NULL,
  cadence_note TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agenda_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  priority TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  meeting_intent TEXT,
  target_meeting_id TEXT,
  owner TEXT,
  decision_needed TEXT,
  next_action TEXT,
  notes_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (target_meeting_id) REFERENCES meetings(id)
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'sharepoint',
  sharepoint_item_id TEXT,
  sharepoint_web_url TEXT,
  sharepoint_path TEXT,
  mime_type TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS item_documents (
  item_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  relation_type TEXT NOT NULL DEFAULT 'reference',
  created_at TEXT NOT NULL,
  PRIMARY KEY (item_id, document_id),
  FOREIGN KEY (item_id) REFERENCES agenda_items(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS item_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_note TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES agenda_items(id) ON DELETE CASCADE
);
`);

try {
  db.exec(`ALTER TABLE documents ADD COLUMN notes TEXT`);
} catch (err) {
  // ignore if column already exists
}
try {
  db.exec(`ALTER TABLE agenda_items ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`);
} catch (err) {
  // ignore if column already exists
}

const nowIso = () => new Date().toISOString();

function normalizeSortOrder() {
  const rows = db.prepare('SELECT id FROM agenda_items ORDER BY sort_order ASC, created_at ASC, id ASC').all();
  const update = db.prepare('UPDATE agenda_items SET sort_order = ? WHERE id = ?');
  const tx = db.transaction((items) => {
    items.forEach((row, index) => update.run(index + 1, row.id));
  });
  tx(rows);
}

function nextSortOrder() {
  const row = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM agenda_items').get();
  return Number(row.max_sort || 0) + 1;
}

function seedMeetings() {
  const rows = [
    ['2026-04', 'April 2026 board meeting', '2026-04-14', 'Special extra meeting during startup phase', 'planned'],
    ['2026-06', 'June 2026 board meeting', '2026-06-09', 'Transition meeting before odd-month cadence resumes', 'planned'],
    ['2026-08', 'August 2026 board meeting', '2026-08-11', 'Start of expected every-other-month cadence', 'planned'],
  ];

  const insert = db.prepare(`
    INSERT OR IGNORE INTO meetings (id, title, meeting_date, cadence_note, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const row of rows) {
    insert.run(...row, nowIso(), nowIso());
  }
}

function seedFromLegacyJson() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM agenda_items').get().count;
  if (count > 0) return;
  if (!fs.existsSync(LEGACY_JSON_PATH)) return;

  const raw = JSON.parse(fs.readFileSync(LEGACY_JSON_PATH, 'utf8'));
  const insertItem = db.prepare(`
    INSERT INTO agenda_items (
      id, title, description, category, priority, sort_order, kind, status, meeting_intent,
      target_meeting_id, owner, decision_needed, next_action, notes_json, created_at, updated_at
    ) VALUES (
      @id, @title, @description, @category, @priority, @sort_order, @kind, @status, @meeting_intent,
      @target_meeting_id, @owner, @decision_needed, @next_action, @notes_json, @created_at, @updated_at
    )
  `);
  const insertHistory = db.prepare(`
    INSERT INTO item_history (item_id, event_type, event_note, created_at) VALUES (?, ?, ?, ?)
  `);

  const tx = db.transaction((items) => {
    for (const item of items) {
      const createdAt = nowIso();
      const nextAction =
        item.id === 'AI-2026-001' ? 'Get bids and supporting evaluation details before the April meeting.' :
        item.id === 'AI-2026-002' ? 'Collect bids and add prior vendor details when available.' :
        item.id === 'AI-2026-003' ? 'Define response plan and determine whether later board discussion is needed.' :
        item.id === 'AI-2026-004' ? 'Confirm ownership and whether this needs board review before sending.' :
        item.id === 'AI-2026-005' ? 'Decide cadence, participants, and scheduling process.' : null;

      insertItem.run({
        id: item.id,
        title: item.title,
        description: item.description || null,
        category: item.category || null,
        priority: item.priority || null,
        sort_order: nextSortOrder(),
        kind: item.kind || 'task',
        status: item.status || 'todo',
        meeting_intent: item.meetingIntent || null,
        target_meeting_id: item.targetMeeting || null,
        owner: item.owner || null,
        decision_needed: item.decisionNeeded || null,
        next_action: nextAction,
        notes_json: JSON.stringify(item.notes || []),
        created_at: createdAt,
        updated_at: createdAt,
      });

      for (const hist of item.history || []) {
        insertHistory.run(item.id, hist.event || 'created', hist.note || null, hist.date ? new Date(hist.date).toISOString() : createdAt);
      }
    }
  });

  tx(raw);
}

seedMeetings();
seedFromLegacyJson();
normalizeSortOrder();

function loadToken() {
  if (!fs.existsSync(TOKEN_PATH)) throw new Error(`Missing Graph token file at ${TOKEN_PATH}`);
  return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
}

function saveToken(token) {
  token._fetched_at = Math.floor(Date.now() / 1000);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
}

async function refreshToken(token) {
  if (!TOKEN_URL || !CLIENT_ID) {
    throw new Error('MS_TENANT_ID or MS_CLIENT_ID missing for token refresh');
  }
  if (!token.refresh_token) throw new Error('Missing refresh_token');
  const scope = (token.scope || '').trim();
  if (!scope) throw new Error('Missing token scope');

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: token.refresh_token,
    scope,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) throw new Error(`Token refresh failed (${res.status}): ${text}`);
  const merged = { ...token, ...data };
  saveToken(merged);
  return merged;
}

async function getAccessToken() {
  let token = loadToken();
  const fetched = Number(token._fetched_at || 0);
  const expiresIn = Number(token.expires_in || 0);
  const now = Math.floor(Date.now() / 1000);
  if (!token.access_token || now > fetched + Math.max(0, expiresIn - 120)) {
    token = await refreshToken(token);
  }
  return token.access_token;
}

async function graphRequest(method, url, body = null, headers = undefined, retry = true) {
  const accessToken = await getAccessToken();
  let payloadBody = body;
  const finalHeaders = {
    Authorization: `Bearer ${accessToken}`,
    ...(headers || {}),
  };

  const isBufferLike = Buffer.isBuffer(body) || body instanceof Uint8Array || body instanceof ArrayBuffer;
  if (body && typeof body === 'object' && !isBufferLike && !(body instanceof URLSearchParams)) {
    payloadBody = JSON.stringify(body);
    if (!finalHeaders['Content-Type']) finalHeaders['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method,
    headers: finalHeaders,
    body: payloadBody,
  });

  if (res.status === 401 && retry) {
    const token = loadToken();
    await refreshToken(token);
    return graphRequest(method, url, body, headers, false);
  }

  const contentType = res.headers.get('content-type') || '';
  const buffer = Buffer.from(await res.arrayBuffer());
  let payload = buffer;
  if (contentType.includes('application/json')) {
    payload = JSON.parse(buffer.toString('utf8'));
  } else if (contentType.startsWith('text/') || contentType.includes('xml')) {
    payload = buffer.toString('utf8');
  }

  if (!res.ok) {
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    throw new Error(`Graph ${method} failed (${res.status}) at ${url}: ${text}`);
  }
  return payload;
}

async function graphJson(method, url, body = null, headers = undefined) {
  const payload = await graphRequest(method, url, body, headers);
  return payload;
}

async function graphRaw(method, url, body = null, headers = undefined) {
  return graphRequest(method, url, body, headers);
}

async function ensureSharePointDrive() {
  const encodedSitePath = SP_SITE_PATH
    .split('/')
    .filter(Boolean)
    .map((p) => encodeURIComponent(p))
    .join('/');
  const site = await graphJson('GET', `${GRAPH}/sites/${SP_HOST}:/${encodedSitePath}`);
  const drive = await graphJson('GET', `${GRAPH}/sites/${site.id}/drive`);
  return { site, drive };
}

function sanitizePathSegment(input) {
  return String(input || '')
    .trim()
    .replace(/[\\/:*?"<>|#%&{}~+]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

async function getDriveItemByPath(driveId, folderPath) {
  const encodedPath = folderPath.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return graphJson('GET', `${GRAPH}/drives/${driveId}/root:/${encodedPath}`);
}

async function ensureChildFolder(driveId, parentPath, folderName) {
  const childPath = parentPath ? `${parentPath}/${folderName}` : folderName;
  try {
    return await getDriveItemByPath(driveId, childPath);
  } catch (_err) {
    const parentUrl = parentPath
      ? `${GRAPH}/drives/${driveId}/root:/${parentPath.split('/').map(encodeURIComponent).join('/')}:/children`
      : `${GRAPH}/drives/${driveId}/root/children`;
    return graphJson('POST', parentUrl, {
      name: folderName,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'rename',
    });
  }
}

async function ensureAgendaFolderChain(driveId, itemId, title) {
  await getDriveItemByPath(driveId, SP_BACKEND_ROOT);
  await ensureChildFolder(driveId, SP_BACKEND_ROOT, SP_DOC_LIB_NAME);
  const itemFolderName = `${sanitizePathSegment(itemId)} ${sanitizePathSegment(title)}`;
  const itemFolder = await ensureChildFolder(driveId, `${SP_BACKEND_ROOT}/${SP_DOC_LIB_NAME}`, itemFolderName);
  return {
    rootPath: SP_BACKEND_ROOT,
    libraryPath: `${SP_BACKEND_ROOT}/${SP_DOC_LIB_NAME}`,
    folderPath: `${SP_BACKEND_ROOT}/${SP_DOC_LIB_NAME}/${itemFolderName}`,
    itemFolder,
  };
}

function getItem(itemId) {
  const item = db.prepare(`
    SELECT ai.*, m.title AS target_meeting_title, m.meeting_date AS target_meeting_date
    FROM agenda_items ai
    LEFT JOIN meetings m ON m.id = ai.target_meeting_id
    WHERE ai.id = ?
  `).get(itemId);
  if (!item) return null;

  const notes = JSON.parse(item.notes_json || '[]');
  const documents = db.prepare(`
    SELECT d.*, idoc.relation_type
    FROM item_documents idoc
    JOIN documents d ON d.id = idoc.document_id
    WHERE idoc.item_id = ?
    ORDER BY d.updated_at DESC
  `).all(itemId);
  const history = db.prepare(`
    SELECT id, event_type, event_note, created_at
    FROM item_history
    WHERE item_id = ?
    ORDER BY created_at DESC, id DESC
  `).all(itemId);

  return {
    ...item,
    notes,
    documents,
    history,
  };
}

const app = express();
app.use(cors());
app.use(express.json());

function mountApi(prefix = '') {
  app.get(`${prefix}/api/health`, (_req, res) => {
    res.json({ ok: true, dbPath: DB_PATH });
  });

  app.get(`${prefix}/api/meetings`, (_req, res) => {
    const meetings = db.prepare('SELECT * FROM meetings ORDER BY meeting_date ASC').all();
    res.json(meetings);
  });

  app.get(`${prefix}/api/items`, (_req, res) => {
    const rows = db.prepare(`
      SELECT ai.*, m.title AS target_meeting_title, m.meeting_date AS target_meeting_date
      FROM agenda_items ai
      LEFT JOIN meetings m ON m.id = ai.target_meeting_id
      ORDER BY ai.sort_order ASC, ai.updated_at DESC, ai.title ASC
    `).all();
    res.json(rows.map((row) => ({ ...row, notes: JSON.parse(row.notes_json || '[]') })));
  });

  app.get(`${prefix}/api/items/:id`, (req, res) => {
    const item = getItem(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  });

  app.post(`${prefix}/api/items`, (req, res) => {
    const body = req.body || {};
    const id = body.id || `AI-${Date.now()}`;
    const createdAt = nowIso();
    db.prepare(`
      INSERT INTO agenda_items (
        id, title, description, category, priority, sort_order, kind, status, meeting_intent,
        target_meeting_id, owner, decision_needed, next_action, notes_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.title,
      body.description || null,
      body.category || null,
      body.priority || 'medium',
      body.sort_order || nextSortOrder(),
      body.kind || 'task',
      body.status || 'todo',
      body.meeting_intent || null,
      body.target_meeting_id || null,
      body.owner || null,
      body.decision_needed || null,
      body.next_action || null,
      JSON.stringify(body.notes || []),
      createdAt,
      createdAt,
    );
    db.prepare('INSERT INTO item_history (item_id, event_type, event_note, created_at) VALUES (?, ?, ?, ?)').run(id, 'created', 'Item created via API', createdAt);
    res.status(201).json(getItem(id));
  });

  app.patch(`${prefix}/api/items/:id`, (req, res) => {
    const existing = getItem(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const body = req.body || {};
    const updated = {
      ...existing,
      ...body,
      notes_json: JSON.stringify(body.notes ?? existing.notes ?? []),
      updated_at: nowIso(),
    };

    db.prepare(`
      UPDATE agenda_items SET
        title = ?, description = ?, category = ?, priority = ?, sort_order = ?, kind = ?, status = ?,
        meeting_intent = ?, target_meeting_id = ?, owner = ?, decision_needed = ?,
        next_action = ?, notes_json = ?, updated_at = ?
      WHERE id = ?
    `).run(
      updated.title,
      updated.description || null,
      updated.category || null,
      updated.priority || null,
      updated.sort_order || existing.sort_order || nextSortOrder(),
      updated.kind,
      updated.status,
      updated.meeting_intent || null,
      updated.target_meeting_id || null,
      updated.owner || null,
      updated.decision_needed || null,
      updated.next_action || null,
      updated.notes_json,
      updated.updated_at,
      req.params.id,
    );

    db.prepare('INSERT INTO item_history (item_id, event_type, event_note, created_at) VALUES (?, ?, ?, ?)').run(
      req.params.id,
      'updated',
      body.history_note || 'Item updated via API',
      updated.updated_at,
    );

    res.json(getItem(req.params.id));
  });

  app.post(`${prefix}/api/items/reorder`, (req, res) => {
    const body = req.body || {};
    const itemIds = Array.isArray(body.itemIds) ? body.itemIds.filter(Boolean) : [];
    if (!itemIds.length) return res.status(400).json({ error: 'itemIds is required' });
    const update = db.prepare('UPDATE agenda_items SET sort_order = ?, updated_at = ? WHERE id = ?');
    const timestamp = nowIso();
    const tx = db.transaction((ids) => {
      ids.forEach((id, index) => update.run(index + 1, timestamp, id));
    });
    tx(itemIds);
    res.json({ ok: true, itemIds });
  });

  app.get(`${prefix}/api/documents`, (req, res) => {
    const itemId = req.query.item_id;
    if (itemId) {
      const docs = db.prepare(`
        SELECT d.*, idoc.relation_type
        FROM item_documents idoc
        JOIN documents d ON d.id = idoc.document_id
        WHERE idoc.item_id = ?
        ORDER BY d.updated_at DESC
      `).all(itemId);
      return res.json(docs);
    }
    const docs = db.prepare('SELECT * FROM documents ORDER BY updated_at DESC').all();
    res.json(docs);
  });

  app.post(`${prefix}/api/documents`, (req, res) => {
    const body = req.body || {};
    const id = body.id || `DOC-${Date.now()}`;
    const createdAt = nowIso();
    db.prepare(`
      INSERT INTO documents (id, title, source_type, sharepoint_item_id, sharepoint_web_url, sharepoint_path, mime_type, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.title,
      body.source_type || 'sharepoint',
      body.sharepoint_item_id || null,
      body.sharepoint_web_url || null,
      body.sharepoint_path || null,
      body.mime_type || null,
      body.notes || null,
      createdAt,
      createdAt,
    );

    if (body.item_id) {
      db.prepare('INSERT OR REPLACE INTO item_documents (item_id, document_id, relation_type, created_at) VALUES (?, ?, ?, ?)').run(
        body.item_id,
        id,
        body.relation_type || 'reference',
        createdAt,
      );
      db.prepare('INSERT INTO item_history (item_id, event_type, event_note, created_at) VALUES (?, ?, ?, ?)').run(
        body.item_id,
        'document_linked',
        `Linked document ${body.title}`,
        createdAt,
      );
    }

    res.status(201).json({ id });
  });

  app.post(`${prefix}/api/sharepoint/link`, async (req, res) => {
    try {
      const body = req.body || {};
      if (!body.item_id || !body.title || !body.web_url) {
        return res.status(400).json({ error: 'item_id, title, and web_url are required' });
      }
      const id = body.id || `DOC-${Date.now()}`;
      const createdAt = nowIso();
      db.prepare(`
        INSERT INTO documents (id, title, source_type, sharepoint_item_id, sharepoint_web_url, sharepoint_path, mime_type, notes, created_at, updated_at)
        VALUES (?, ?, 'sharepoint', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        body.title,
        body.sharepoint_item_id || null,
        body.web_url,
        body.sharepoint_path || null,
        body.mime_type || null,
        body.notes || null,
        createdAt,
        createdAt,
      );
      db.prepare('INSERT OR REPLACE INTO item_documents (item_id, document_id, relation_type, created_at) VALUES (?, ?, ?, ?)').run(
        body.item_id,
        id,
        body.relation_type || 'reference',
        createdAt,
      );
      db.prepare('INSERT INTO item_history (item_id, event_type, event_note, created_at) VALUES (?, ?, ?, ?)').run(
        body.item_id,
        'document_linked',
        `Linked SharePoint document ${body.title}`,
        createdAt,
      );
      res.status(201).json({ id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post(`${prefix}/api/sharepoint/provision-folder`, async (req, res) => {
    try {
      const body = req.body || {};
      if (!body.item_id || !body.title) return res.status(400).json({ error: 'item_id and title are required' });
      const { drive } = await ensureSharePointDrive();
      const result = await ensureAgendaFolderChain(drive.id, body.item_id, body.title);
      res.json({ ok: true, driveId: drive.id, ...result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post(`${prefix}/api/sharepoint/upload`, async (req, res) => {
    try {
      const body = req.body || {};
      if (!body.item_id || !body.title || !body.filename || !body.content_base64) {
        return res.status(400).json({ error: 'item_id, title, filename, and content_base64 are required' });
      }
      const { drive } = await ensureSharePointDrive();
      const { folderPath } = await ensureAgendaFolderChain(drive.id, body.item_id, body.title);

      const safeFilename = sanitizePathSegment(body.filename).replace(/ /g, '_');
      const uploadPath = `${folderPath}/${safeFilename}`.split('/').map(encodeURIComponent).join('/');
      const fileBuffer = Buffer.from(body.content_base64, 'base64');
      const uploaded = await graphRaw(
        'PUT',
        `${GRAPH}/drives/${drive.id}/root:/${uploadPath}:/content`,
        fileBuffer,
        { 'Content-Type': body.mime_type || 'application/octet-stream' },
      );

      const docId = `DOC-${Date.now()}`;
      const createdAt = nowIso();
      db.prepare(`
        INSERT INTO documents (id, title, source_type, sharepoint_item_id, sharepoint_web_url, sharepoint_path, mime_type, notes, created_at, updated_at)
        VALUES (?, ?, 'sharepoint', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        docId,
        body.document_title || body.filename,
        uploaded.id || null,
        uploaded.webUrl || null,
        uploaded.parentReference?.path ? `${uploaded.parentReference.path}/${uploaded.name}` : `${folderPath}/${safeFilename}`,
        body.mime_type || null,
        body.notes || null,
        createdAt,
        createdAt,
      );
      db.prepare('INSERT OR REPLACE INTO item_documents (item_id, document_id, relation_type, created_at) VALUES (?, ?, ?, ?)').run(
        body.item_id,
        docId,
        body.relation_type || 'reference',
        createdAt,
      );
      db.prepare('INSERT INTO item_history (item_id, event_type, event_note, created_at) VALUES (?, ?, ?, ?)').run(
        body.item_id,
        'document_uploaded',
        `Uploaded document ${body.filename}`,
        createdAt,
      );
      res.status(201).json({ ok: true, documentId: docId, webUrl: uploaded.webUrl, folderPath });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

mountApi('');
mountApi('/agenda2');

if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.use((_req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

const port = process.env.PORT || 8090;
app.listen(port, () => {
  console.log(`HOA agenda server listening on http://127.0.0.1:${port}`);
  console.log(`SQLite DB: ${DB_PATH}`);
});
