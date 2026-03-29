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
const PERMIT_STATUS_OPTIONS = ['Pending', 'Approved', 'Denied'];

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

CREATE TABLE IF NOT EXISTS homeowners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_number TEXT NOT NULL,
  unit_display TEXT NOT NULL,
  property_address TEXT,
  mailing_address TEXT,
  is_rental INTEGER NOT NULL DEFAULT 0,
  source_email TEXT,
  notes TEXT,
  source_file TEXT,
  source_updated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (account_number, unit_display)
);

CREATE TABLE IF NOT EXISTS homeowner_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  homeowner_id INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT,
  is_board_member INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (homeowner_id) REFERENCES homeowners(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS homeowner_parking_permits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  homeowner_id INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  year TEXT,
  status TEXT,
  permit_number TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (homeowner_id) REFERENCES homeowners(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS homeowner_parking_permit_documents (
  permit_id INTEGER NOT NULL,
  document_id TEXT NOT NULL,
  relation_type TEXT NOT NULL DEFAULT 'reference',
  created_at TEXT NOT NULL,
  PRIMARY KEY (permit_id, document_id),
  FOREIGN KEY (permit_id) REFERENCES homeowner_parking_permits(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS homeowner_automobiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  homeowner_id INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  license_plate TEXT,
  make TEXT,
  model TEXT,
  color TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (homeowner_id) REFERENCES homeowners(id) ON DELETE CASCADE
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
try {
  db.exec(`ALTER TABLE homeowner_parking_permits ADD COLUMN permit_number TEXT`);
} catch (err) {
  // ignore if column already exists
}
db.prepare(`
  UPDATE homeowner_parking_permits
  SET status = 'Pending'
  WHERE status IS NULL OR TRIM(status) = ''
`).run();
const normalizePermitStatuses = db.prepare('UPDATE homeowner_parking_permits SET status = ? WHERE id = ?');
db.prepare('SELECT id, status FROM homeowner_parking_permits').all().forEach((row) => {
  const status = normalizePermitStatus(row.status, 'Pending');
  normalizePermitStatuses.run(status, row.id);
});

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

function normalizeString(input) {
  const value = input == null ? '' : String(input);
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizePermitStatus(input, fallback = null) {
  const normalized = normalizeString(input);
  if (!normalized) return fallback;
  const matched = PERMIT_STATUS_OPTIONS.find((option) => option.toLowerCase() === normalized.toLowerCase());
  return matched || null;
}

function toIntBoolean(value) {
  return value ? 1 : 0;
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

async function ensureParkingPermitFolderChain(driveId, permit) {
  await getDriveItemByPath(driveId, SP_BACKEND_ROOT);
  await ensureChildFolder(driveId, SP_BACKEND_ROOT, SP_DOC_LIB_NAME);
  const permitsPath = `${SP_BACKEND_ROOT}/${SP_DOC_LIB_NAME}`;
  await ensureChildFolder(driveId, permitsPath, 'Parking Permits');
  const basePath = `${permitsPath}/Parking Permits`;
  const yearFolder = `Year ${sanitizePathSegment(permit.year || 'Unknown')}`;
  const unitFolder = `Unit ${sanitizePathSegment(permit.unit_display || 'Unknown')}`;
  const permitSuffix = permit.permit_number ? ` ${sanitizePathSegment(permit.permit_number)}` : '';
  const permitFolderName = `Permit ${permit.id}${permitSuffix}`;
  await ensureChildFolder(driveId, basePath, yearFolder);
  await ensureChildFolder(driveId, `${basePath}/${yearFolder}`, unitFolder);
  await ensureChildFolder(driveId, `${basePath}/${yearFolder}/${unitFolder}`, permitFolderName);
  return `${basePath}/${yearFolder}/${unitFolder}/${permitFolderName}`;
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

function getPermitDocuments(permitId) {
  return db.prepare(`
    SELECT d.*, pdoc.relation_type
    FROM homeowner_parking_permit_documents pdoc
    JOIN documents d ON d.id = pdoc.document_id
    WHERE pdoc.permit_id = ?
    ORDER BY d.updated_at DESC
  `).all(permitId);
}

function getParkingPermitById(permitId) {
  const permit = db.prepare(`
    SELECT
      p.*,
      h.unit_display,
      h.account_number,
      COALESCE((SELECT GROUP_CONCAT(c.name, CHAR(31)) FROM homeowner_contacts c WHERE c.homeowner_id = h.id), '') AS contact_names
    FROM homeowner_parking_permits p
    JOIN homeowners h ON h.id = p.homeowner_id
    WHERE p.id = ?
  `).get(permitId);

  if (!permit) return null;

  const homeownerNames = String(permit.contact_names || '')
    .split('\u001f')
    .map((name) => String(name).trim())
    .filter(Boolean);
  const documents = getPermitDocuments(permit.id);

  return {
    ...permit,
    status: normalizePermitStatus(permit.status, 'Pending'),
    homeowner_names: homeownerNames,
    documents,
    document_count: documents.length,
  };
}

function mapHomeownerDetail(homeowner) {
  const permits = db.prepare(`
    SELECT id, sort_order, year, status, permit_number
    FROM homeowner_parking_permits
    WHERE homeowner_id = ?
    ORDER BY sort_order ASC, id ASC
  `).all(homeowner.id);

  return {
    ...homeowner,
    is_rental: Boolean(homeowner.is_rental),
    contacts: db.prepare(`
      SELECT id, sort_order, name, email, phone, role, is_board_member
      FROM homeowner_contacts
      WHERE homeowner_id = ?
      ORDER BY sort_order ASC, id ASC
    `).all(homeowner.id).map((contact) => ({ ...contact, is_board_member: Boolean(contact.is_board_member) })),
    parking_permits: permits.map((permit) => ({
      ...permit,
      status: normalizePermitStatus(permit.status, 'Pending'),
      documents: getPermitDocuments(permit.id),
    })),
    automobiles: db.prepare(`
      SELECT id, sort_order, license_plate, make, model, color
      FROM homeowner_automobiles
      WHERE homeowner_id = ?
      ORDER BY sort_order ASC, id ASC
    `).all(homeowner.id),
  };
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));

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

  app.get(`${prefix}/api/homeowners`, (req, res) => {
    const rows = db.prepare(`
      SELECT
        h.*,
        (SELECT COUNT(*) FROM homeowner_contacts c WHERE c.homeowner_id = h.id) AS contact_count,
        (SELECT COUNT(*) FROM homeowner_parking_permits p WHERE p.homeowner_id = h.id) AS permit_count,
        (SELECT COUNT(*) FROM homeowner_automobiles a WHERE a.homeowner_id = h.id) AS automobile_count,
        COALESCE((SELECT GROUP_CONCAT(c.name, CHAR(31)) FROM homeowner_contacts c WHERE c.homeowner_id = h.id), '') AS contact_names,
        COALESCE((SELECT GROUP_CONCAT(c.email, ' ') FROM homeowner_contacts c WHERE c.homeowner_id = h.id), '') AS contact_emails
      FROM homeowners h
      ORDER BY CAST(h.unit_display AS INTEGER) ASC, h.unit_display ASC, h.account_number ASC
    `).all();

    const q = String(req.query.q || '').trim().toLowerCase();
    const filtered = q
      ? rows.filter((row) => {
        const haystack = [
          row.account_number,
          row.unit_display,
          row.property_address,
          row.mailing_address,
          row.source_email,
          row.notes,
          row.contact_names,
          row.contact_emails,
        ].map((value) => String(value || '').toLowerCase()).join(' ');
        return haystack.includes(q);
      })
      : rows;

    res.json(filtered.map((row) => {
      const { contact_emails: _contactEmails, ...rest } = row;
      const contactNames = String(row.contact_names || '')
        .split('\u001f')
        .map((name) => String(name).trim())
        .filter(Boolean);
      return { ...rest, is_rental: Boolean(rest.is_rental), contact_names: contactNames };
    }));
  });

  app.get(`${prefix}/api/homeowners/:id`, (req, res) => {
    const homeownerId = Number(req.params.id);
    if (!Number.isFinite(homeownerId)) return res.status(400).json({ error: 'Invalid homeowner id' });
    const homeowner = db.prepare('SELECT * FROM homeowners WHERE id = ?').get(homeownerId);
    if (!homeowner) return res.status(404).json({ error: 'Not found' });
    res.json(mapHomeownerDetail(homeowner));
  });

  app.get(`${prefix}/api/board-members`, (_req, res) => {
    const rows = db.prepare(`
      SELECT
        c.id AS contact_id,
        c.name,
        c.email,
        c.phone,
        c.role,
        c.sort_order,
        h.id AS homeowner_id,
        h.account_number,
        h.unit_display,
        h.property_address
      FROM homeowner_contacts c
      JOIN homeowners h ON h.id = c.homeowner_id
      WHERE c.is_board_member = 1
      ORDER BY CAST(h.unit_display AS INTEGER) ASC, h.unit_display ASC, h.account_number ASC, c.sort_order ASC, c.id ASC
    `).all();

    res.json(rows);
  });

  app.get(`${prefix}/api/parking-permits/years`, (_req, res) => {
    const years = db.prepare(`
      SELECT DISTINCT year
      FROM homeowner_parking_permits
      WHERE year IS NOT NULL AND TRIM(year) <> ''
      ORDER BY year DESC
    `).all().map((row) => row.year);
    res.json(years);
  });

  app.get(`${prefix}/api/parking-permits`, (req, res) => {
    const yearFilter = normalizeString(req.query.year);
    const rows = db.prepare(`
      SELECT
        p.*,
        h.unit_display,
        h.account_number,
        COALESCE((SELECT GROUP_CONCAT(c.name, CHAR(31)) FROM homeowner_contacts c WHERE c.homeowner_id = h.id), '') AS contact_names
      FROM homeowner_parking_permits p
      JOIN homeowners h ON h.id = p.homeowner_id
      WHERE (? IS NULL OR p.year = ?)
      ORDER BY CAST(h.unit_display AS INTEGER) ASC, h.unit_display ASC, h.account_number ASC, p.sort_order ASC, p.id ASC
    `).all(yearFilter, yearFilter);

    res.json(rows.map((row) => ({
      ...row,
      status: normalizePermitStatus(row.status, 'Pending'),
      homeowner_names: String(row.contact_names || '')
        .split('\u001f')
        .map((name) => String(name).trim())
        .filter(Boolean),
      document_count: db.prepare('SELECT COUNT(*) AS count FROM homeowner_parking_permit_documents WHERE permit_id = ?').get(row.id).count,
    })));
  });

  app.get(`${prefix}/api/parking-permits/:id`, (req, res) => {
    const permitId = Number(req.params.id);
    if (!Number.isFinite(permitId)) return res.status(400).json({ error: 'Invalid permit id' });
    const permit = getParkingPermitById(permitId);
    if (!permit) return res.status(404).json({ error: 'Not found' });
    res.json(permit);
  });

  app.post(`${prefix}/api/homeowners/:id/parking-permits`, (req, res) => {
    const homeownerId = Number(req.params.id);
    if (!Number.isFinite(homeownerId)) return res.status(400).json({ error: 'Invalid homeowner id' });
    const homeowner = db.prepare('SELECT id FROM homeowners WHERE id = ?').get(homeownerId);
    if (!homeowner) return res.status(404).json({ error: 'Homeowner not found' });

    const body = req.body || {};
    const year = normalizeString(body.year);
    const permitNumber = normalizeString(body.permit_number);
    const status = normalizePermitStatus(body.status, 'Pending');
    if (body.status != null && !status) {
      return res.status(400).json({ error: `Permit status must be one of: ${PERMIT_STATUS_OPTIONS.join(', ')}` });
    }
    if (!year && !permitNumber) {
      return res.status(400).json({ error: 'Permit year or permit number is required' });
    }

    const updatedAt = nowIso();
    const maxSort = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM homeowner_parking_permits WHERE homeowner_id = ?').get(homeownerId);
    const insert = db.prepare(`
      INSERT INTO homeowner_parking_permits (
        homeowner_id, sort_order, year, status, permit_number, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = insert.run(homeownerId, Number(maxSort.max_sort || 0) + 1, year, status, permitNumber, updatedAt, updatedAt);
    const permit = getParkingPermitById(Number(result.lastInsertRowid));
    res.status(201).json(permit);
  });

  app.patch(`${prefix}/api/parking-permits/:id`, (req, res) => {
    const permitId = Number(req.params.id);
    if (!Number.isFinite(permitId)) return res.status(400).json({ error: 'Invalid permit id' });
    const existing = db.prepare('SELECT * FROM homeowner_parking_permits WHERE id = ?').get(permitId);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const body = req.body || {};
    const year = Object.prototype.hasOwnProperty.call(body, 'year') ? normalizeString(body.year) : normalizeString(existing.year);
    const permitNumber = Object.prototype.hasOwnProperty.call(body, 'permit_number')
      ? normalizeString(body.permit_number)
      : normalizeString(existing.permit_number);
    const status = Object.prototype.hasOwnProperty.call(body, 'status')
      ? normalizePermitStatus(body.status, 'Pending')
      : normalizePermitStatus(existing.status, 'Pending');

    if (Object.prototype.hasOwnProperty.call(body, 'status') && body.status != null && !status) {
      return res.status(400).json({ error: `Permit status must be one of: ${PERMIT_STATUS_OPTIONS.join(', ')}` });
    }
    if (!year && !permitNumber) {
      return res.status(400).json({ error: 'Permit year or permit number is required' });
    }

    db.prepare(`
      UPDATE homeowner_parking_permits
      SET year = ?, status = ?, permit_number = ?, updated_at = ?
      WHERE id = ?
    `).run(year, status, permitNumber, nowIso(), permitId);

    const permit = getParkingPermitById(permitId);
    res.json(permit);
  });

  app.delete(`${prefix}/api/parking-permits/:id`, (req, res) => {
    const permitId = Number(req.params.id);
    if (!Number.isFinite(permitId)) return res.status(400).json({ error: 'Invalid permit id' });
    const existing = db.prepare('SELECT id FROM homeowner_parking_permits WHERE id = ?').get(permitId);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM homeowner_parking_permits WHERE id = ?').run(permitId);
    res.json({ ok: true, deleted: true, permitId });
  });

  app.patch(`${prefix}/api/homeowners/:id`, (req, res) => {
    const homeownerId = Number(req.params.id);
    if (!Number.isFinite(homeownerId)) return res.status(400).json({ error: 'Invalid homeowner id' });
    const existing = db.prepare('SELECT * FROM homeowners WHERE id = ?').get(homeownerId);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const body = req.body || {};
    const forbiddenFields = ['account_number', 'unit_display', 'property_address'];
    const attemptedReadonly = forbiddenFields.find((field) => Object.prototype.hasOwnProperty.call(body, field));
    if (attemptedReadonly) {
      return res.status(400).json({ error: `${attemptedReadonly} is read-only` });
    }

    const contacts = body.contacts;
    const permits = body.parking_permits;
    const automobiles = body.automobiles;

    if (contacts != null && !Array.isArray(contacts)) return res.status(400).json({ error: 'contacts must be an array' });
    if (permits != null && !Array.isArray(permits)) return res.status(400).json({ error: 'parking_permits must be an array' });
    if (automobiles != null && !Array.isArray(automobiles)) return res.status(400).json({ error: 'automobiles must be an array' });
    if (Array.isArray(permits)) {
      for (const permit of permits) {
        if (permit == null || typeof permit !== 'object') {
          return res.status(400).json({ error: 'parking_permits entries must be objects' });
        }
        if (permit.status != null && normalizePermitStatus(permit.status) == null) {
          return res.status(400).json({ error: `Permit status must be one of: ${PERMIT_STATUS_OPTIONS.join(', ')}` });
        }
      }
    }

    const updatedAt = nowIso();
    const updateHomeowner = db.prepare(`
      UPDATE homeowners
      SET mailing_address = ?, is_rental = ?, source_email = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `);
    const deleteContacts = db.prepare('DELETE FROM homeowner_contacts WHERE homeowner_id = ?');
    const deleteAutomobiles = db.prepare('DELETE FROM homeowner_automobiles WHERE homeowner_id = ?');

    const insertContact = db.prepare(`
      INSERT INTO homeowner_contacts (
        homeowner_id, sort_order, name, email, phone, role, is_board_member, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertPermit = db.prepare(`
      INSERT INTO homeowner_parking_permits (
        homeowner_id, sort_order, year, status, permit_number, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const updatePermit = db.prepare(`
      UPDATE homeowner_parking_permits
      SET sort_order = ?, year = ?, status = ?, permit_number = ?, updated_at = ?
      WHERE id = ? AND homeowner_id = ?
    `);
    const deletePermitById = db.prepare('DELETE FROM homeowner_parking_permits WHERE id = ? AND homeowner_id = ?');
    const insertAutomobile = db.prepare(`
      INSERT INTO homeowner_automobiles (
        homeowner_id, sort_order, license_plate, make, model, color, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = db.transaction(() => {
      updateHomeowner.run(
        Object.prototype.hasOwnProperty.call(body, 'mailing_address') ? normalizeString(body.mailing_address) : normalizeString(existing.mailing_address),
        Object.prototype.hasOwnProperty.call(body, 'is_rental') ? toIntBoolean(body.is_rental) : toIntBoolean(existing.is_rental),
        Object.prototype.hasOwnProperty.call(body, 'source_email') ? normalizeString(body.source_email) : normalizeString(existing.source_email),
        Object.prototype.hasOwnProperty.call(body, 'notes') ? normalizeString(body.notes) : normalizeString(existing.notes),
        updatedAt,
        homeownerId,
      );

      if (Array.isArray(contacts)) {
        deleteContacts.run(homeownerId);
        contacts.forEach((contact, index) => {
          insertContact.run(
            homeownerId,
            index + 1,
            normalizeString(contact?.name) || '(Unnamed contact)',
            normalizeString(contact?.email),
            normalizeString(contact?.phone),
            normalizeString(contact?.role),
            toIntBoolean(contact?.is_board_member),
            updatedAt,
            updatedAt,
          );
        });
      }

      if (Array.isArray(permits)) {
        const existingPermitIds = new Set(
          db.prepare('SELECT id FROM homeowner_parking_permits WHERE homeowner_id = ?').all(homeownerId).map((row) => row.id),
        );
        const seenPermitIds = new Set();
        let sortOrder = 1;

        permits.forEach((permit) => {
          const permitId = Number(permit?.id);
          const year = normalizeString(permit?.year);
          const permitNumber = normalizeString(permit?.permit_number);
          const status = normalizePermitStatus(permit?.status, 'Pending');
          if (!year && !permitNumber && !Number.isFinite(permitId)) return;

          if (Number.isFinite(permitId) && existingPermitIds.has(permitId) && !seenPermitIds.has(permitId)) {
            updatePermit.run(
              sortOrder,
              year,
              status,
              permitNumber,
              updatedAt,
              permitId,
              homeownerId,
            );
            seenPermitIds.add(permitId);
            sortOrder += 1;
            return;
          }

          insertPermit.run(
            homeownerId,
            sortOrder,
            year,
            status,
            permitNumber,
            updatedAt,
            updatedAt,
          );
          sortOrder += 1;
        });

        existingPermitIds.forEach((permitId) => {
          if (!seenPermitIds.has(permitId)) deletePermitById.run(permitId, homeownerId);
        });
      }

      if (Array.isArray(automobiles)) {
        deleteAutomobiles.run(homeownerId);
        automobiles.forEach((automobile, index) => {
          insertAutomobile.run(
            homeownerId,
            index + 1,
            normalizeString(automobile?.license_plate),
            normalizeString(automobile?.make),
            normalizeString(automobile?.model),
            normalizeString(automobile?.color),
            updatedAt,
            updatedAt,
          );
        });
      }
    });

    tx();
    const homeowner = db.prepare('SELECT * FROM homeowners WHERE id = ?').get(homeownerId);
    res.json(mapHomeownerDetail(homeowner));
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

  app.delete(`${prefix}/api/items/:itemId/documents/:documentId`, (req, res) => {
    const { itemId, documentId } = req.params;
    if (!itemId || !documentId) return res.status(400).json({ error: 'itemId and documentId are required' });

    const linkedDoc = db.prepare(`
      SELECT d.title
      FROM item_documents idoc
      JOIN documents d ON d.id = idoc.document_id
      WHERE idoc.item_id = ? AND idoc.document_id = ?
    `).get(itemId, documentId);

    if (!linkedDoc) return res.status(404).json({ error: 'Document link not found for item' });

    const timestamp = nowIso();
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM item_documents WHERE item_id = ? AND document_id = ?').run(itemId, documentId);
      db.prepare('INSERT INTO item_history (item_id, event_type, event_note, created_at) VALUES (?, ?, ?, ?)').run(
        itemId,
        'document_unlinked',
        `Unlinked document ${linkedDoc.title}`,
        timestamp,
      );
    });

    tx();
    res.json({ ok: true, unlinked: true, itemId, documentId });
  });

  app.get(`${prefix}/api/parking-permits/:permitId/documents`, (req, res) => {
    const permitId = Number(req.params.permitId);
    if (!Number.isFinite(permitId)) return res.status(400).json({ error: 'Invalid permit id' });
    const permit = db.prepare('SELECT id FROM homeowner_parking_permits WHERE id = ?').get(permitId);
    if (!permit) return res.status(404).json({ error: 'Permit not found' });
    res.json(getPermitDocuments(permitId));
  });

  app.post(`${prefix}/api/parking-permits/:permitId/sharepoint/link`, async (req, res) => {
    try {
      const permitId = Number(req.params.permitId);
      if (!Number.isFinite(permitId)) return res.status(400).json({ error: 'Invalid permit id' });
      const permit = db.prepare('SELECT id FROM homeowner_parking_permits WHERE id = ?').get(permitId);
      if (!permit) return res.status(404).json({ error: 'Permit not found' });

      const body = req.body || {};
      if (!body.title || !body.web_url) {
        return res.status(400).json({ error: 'title and web_url are required' });
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
      db.prepare(`
        INSERT OR REPLACE INTO homeowner_parking_permit_documents (permit_id, document_id, relation_type, created_at)
        VALUES (?, ?, ?, ?)
      `).run(
        permitId,
        id,
        body.relation_type || 'reference',
        createdAt,
      );
      res.status(201).json({ id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post(`${prefix}/api/parking-permits/:permitId/sharepoint/upload`, async (req, res) => {
    try {
      const permitId = Number(req.params.permitId);
      if (!Number.isFinite(permitId)) return res.status(400).json({ error: 'Invalid permit id' });
      const permit = db.prepare(`
        SELECT p.id, p.year, p.permit_number, h.unit_display
        FROM homeowner_parking_permits p
        JOIN homeowners h ON h.id = p.homeowner_id
        WHERE p.id = ?
      `).get(permitId);
      if (!permit) return res.status(404).json({ error: 'Permit not found' });

      const body = req.body || {};
      if (!body.filename || !body.content_base64) {
        return res.status(400).json({ error: 'filename and content_base64 are required' });
      }

      const { drive } = await ensureSharePointDrive();
      const folderPath = await ensureParkingPermitFolderChain(drive.id, permit);
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
      db.prepare(`
        INSERT OR REPLACE INTO homeowner_parking_permit_documents (permit_id, document_id, relation_type, created_at)
        VALUES (?, ?, ?, ?)
      `).run(
        permitId,
        docId,
        body.relation_type || 'reference',
        createdAt,
      );
      res.status(201).json({ ok: true, documentId: docId, webUrl: uploaded.webUrl, folderPath });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete(`${prefix}/api/parking-permits/:permitId/documents/:documentId`, (req, res) => {
    const permitId = Number(req.params.permitId);
    const { documentId } = req.params;
    if (!Number.isFinite(permitId) || !documentId) {
      return res.status(400).json({ error: 'permitId and documentId are required' });
    }

    const linked = db.prepare(`
      SELECT d.id
      FROM homeowner_parking_permit_documents pdoc
      JOIN documents d ON d.id = pdoc.document_id
      WHERE pdoc.permit_id = ? AND pdoc.document_id = ?
    `).get(permitId, documentId);
    if (!linked) return res.status(404).json({ error: 'Document link not found for permit' });

    db.prepare('DELETE FROM homeowner_parking_permit_documents WHERE permit_id = ? AND document_id = ?').run(permitId, documentId);
    res.json({ ok: true, unlinked: true, permitId, documentId });
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

async function startServer() {
  app.listen(port, () => {
    console.log(`HOA agenda server listening on http://127.0.0.1:${port}`);
    console.log(`SQLite DB: ${DB_PATH}`);
  });
}

startServer();
