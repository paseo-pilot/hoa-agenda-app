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

const nowIso = () => new Date().toISOString();

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
      id, title, description, category, priority, kind, status, meeting_intent,
      target_meeting_id, owner, decision_needed, next_action, notes_json, created_at, updated_at
    ) VALUES (
      @id, @title, @description, @category, @priority, @kind, @status, @meeting_intent,
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
      ORDER BY
        CASE ai.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        ai.updated_at DESC,
        ai.title ASC
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
        id, title, description, category, priority, kind, status, meeting_intent,
        target_meeting_id, owner, decision_needed, next_action, notes_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.title,
      body.description || null,
      body.category || null,
      body.priority || 'medium',
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
        title = ?, description = ?, category = ?, priority = ?, kind = ?, status = ?,
        meeting_intent = ?, target_meeting_id = ?, owner = ?, decision_needed = ?,
        next_action = ?, notes_json = ?, updated_at = ?
      WHERE id = ?
    `).run(
      updated.title,
      updated.description || null,
      updated.category || null,
      updated.priority || null,
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

  app.get(`${prefix}/api/documents`, (_req, res) => {
    const docs = db.prepare('SELECT * FROM documents ORDER BY updated_at DESC').all();
    res.json(docs);
  });

  app.post(`${prefix}/api/documents`, (req, res) => {
    const body = req.body || {};
    const id = body.id || `DOC-${Date.now()}`;
    const createdAt = nowIso();
    db.prepare(`
      INSERT INTO documents (id, title, source_type, sharepoint_item_id, sharepoint_web_url, sharepoint_path, mime_type, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.title,
      body.source_type || 'sharepoint',
      body.sharepoint_item_id || null,
      body.sharepoint_web_url || null,
      body.sharepoint_path || null,
      body.mime_type || null,
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
