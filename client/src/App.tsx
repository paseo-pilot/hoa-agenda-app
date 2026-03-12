import { FormEvent, useEffect, useMemo, useState } from 'react';

type Meeting = {
  id: string;
  title: string;
  meeting_date: string;
  cadence_note?: string | null;
  status: string;
};

type DocumentRecord = {
  id: string;
  title: string;
  source_type: string;
  sharepoint_item_id?: string | null;
  sharepoint_web_url?: string | null;
  sharepoint_path?: string | null;
  mime_type?: string | null;
  notes?: string | null;
  relation_type?: string | null;
  updated_at: string;
};

type AgendaItem = {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  priority?: string | null;
  kind: string;
  status: string;
  meeting_intent?: string | null;
  target_meeting_id?: string | null;
  target_meeting_title?: string | null;
  owner?: string | null;
  decision_needed?: string | null;
  next_action?: string | null;
  notes: string[];
  documents?: DocumentRecord[];
  updated_at: string;
};

type DraftItem = {
  title: string;
  description: string;
  category: string;
  priority: string;
  kind: string;
  status: string;
  meeting_intent: string;
  target_meeting_id: string;
  owner: string;
  decision_needed: string;
  next_action: string;
  notesText: string;
};

type MobileTab = 'board' | 'item' | 'add';

const statusLabel: Record<string, string> = {
  pending_info: 'Pending info',
  todo: 'To-do',
  ready: 'Ready',
  scheduled: 'Scheduled',
  follow_up: 'Follow-up',
  completed: 'Completed',
  backlog: 'Backlog',
};

const meetingIntentLabel: Record<string, string> = {
  next_meeting: 'Next meeting',
  next_meeting_if_ready: 'Next if ready',
  future: 'Future meeting',
  unscheduled: 'Unscheduled',
};

const statusOptions = ['pending_info', 'todo', 'ready', 'scheduled', 'follow_up', 'completed', 'backlog'];
const kindOptions = [
  { value: 'agenda_candidate', label: 'Agenda candidate' },
  { value: 'task', label: 'Board to-do' },
];
const meetingIntentOptions = ['next_meeting', 'next_meeting_if_ready', 'future', 'unscheduled'];
const priorityOptions = ['high', 'medium', 'low'];

const emptyDraft: DraftItem = {
  title: '',
  description: '',
  category: '',
  priority: 'medium',
  kind: 'task',
  status: 'todo',
  meeting_intent: 'unscheduled',
  target_meeting_id: '',
  owner: '',
  decision_needed: '',
  next_action: '',
  notesText: '',
};

function App() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [linkingDocument, setLinkingDocument] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('board');
  const [draft, setDraft] = useState<DraftItem>(emptyDraft);
  const [docDraft, setDocDraft] = useState({ title: '', webUrl: '', path: '', notes: '' });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');
  const apiBase = `${import.meta.env.BASE_URL}api`;

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [meetingsRes, itemsRes] = await Promise.all([fetch(`${apiBase}/meetings`), fetch(`${apiBase}/items`)]);
      if (!meetingsRes.ok || !itemsRes.ok) throw new Error('Failed to load app data');
      const [meetingsJson, itemsJson] = await Promise.all([meetingsRes.json(), itemsRes.json()]);
      setMeetings(meetingsJson);
      setItems(itemsJson);
      if (!selectedItemId && itemsJson.length) setSelectedItemId(itemsJson[0].id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const grouped = useMemo(() => ({
    nextMeeting: items.filter((item) => item.status !== 'completed' && (item.meeting_intent === 'next_meeting' || item.meeting_intent === 'next_meeting_if_ready')),
    todos: items.filter((item) => item.status !== 'completed' && item.kind === 'task' && item.meeting_intent !== 'future'),
    future: items.filter((item) => item.status !== 'completed' && item.meeting_intent === 'future'),
    completed: items.filter((item) => item.status === 'completed'),
  }), [items]);

  const selectedItem = items.find((item) => item.id === selectedItemId) ?? grouped.nextMeeting[0] ?? grouped.todos[0] ?? grouped.future[0] ?? grouped.completed[0] ?? null;

  const stats = [
    { label: 'Total', value: items.length },
    { label: 'Next', value: grouped.nextMeeting.length },
    { label: 'To-dos', value: grouped.todos.length },
    { label: 'Done', value: grouped.completed.length },
  ];

  const refreshSelectedItem = async (itemId: string) => {
    const res = await fetch(`${apiBase}/items/${itemId}`);
    if (!res.ok) throw new Error('Failed to refresh item');
    const fresh = await res.json();
    setItems((prev) => prev.map((item) => (item.id === fresh.id ? fresh : item)));
    return fresh as AgendaItem;
  };

  const updateSelectedItem = async (patch: Partial<AgendaItem>, historyNote: string) => {
    if (!selectedItem) return;
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/items/${selectedItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...patch, history_note: historyNote }),
      });
      if (!res.ok) throw new Error('Failed to update item');
      const updated = await res.json();
      setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setNotice(historyNote);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const createItem = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`${apiBase}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draft.title.trim(),
          description: draft.description.trim() || null,
          category: draft.category.trim() || null,
          priority: draft.priority,
          kind: draft.kind,
          status: draft.status,
          meeting_intent: draft.meeting_intent,
          target_meeting_id: draft.target_meeting_id || null,
          owner: draft.owner.trim() || null,
          decision_needed: draft.decision_needed.trim() || null,
          next_action: draft.next_action.trim() || null,
          notes: draft.notesText.split('\n').map((line) => line.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error('Failed to create item');
      const created = await res.json();
      setItems((prev) => [created, ...prev]);
      setSelectedItemId(created.id);
      setDraft(emptyDraft);
      setMobileTab('item');
      setNotice(`Created item ${created.title}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const linkSharePointDocument = async () => {
    if (!selectedItem || !docDraft.title.trim() || !docDraft.webUrl.trim()) return;
    setLinkingDocument(true);
    try {
      const res = await fetch(`${apiBase}/sharepoint/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: selectedItem.id,
          title: docDraft.title.trim(),
          web_url: docDraft.webUrl.trim(),
          sharepoint_path: docDraft.path.trim() || null,
          notes: docDraft.notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to link document');
      await refreshSelectedItem(selectedItem.id);
      setDocDraft({ title: '', webUrl: '', path: docDraft.path, notes: '' });
      setNotice(`Linked SharePoint document to ${selectedItem.title}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLinkingDocument(false);
    }
  };

  const uploadDocument = async () => {
    if (!selectedItem || !uploadFile) return;
    setUploadingDocument(true);
    try {
      const buffer = await uploadFile.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      const contentBase64 = btoa(binary);

      const res = await fetch(`${apiBase}/sharepoint/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: selectedItem.id,
          title: selectedItem.title,
          filename: uploadFile.name,
          document_title: uploadTitle.trim() || uploadFile.name,
          notes: uploadNotes.trim() || null,
          mime_type: uploadFile.type || 'application/octet-stream',
          content_base64: contentBase64,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to upload document');
      await refreshSelectedItem(selectedItem.id);
      setUploadFile(null);
      setUploadTitle('');
      setUploadNotes('');
      setNotice(`Uploaded ${uploadFile.name} to SharePoint`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploadingDocument(false);
    }
  };

  const handleSelectItem = (id: string) => {
    setSelectedItemId(id);
    setMobileTab('item');
  };

  if (loading) return <div className="loading-screen">Loading HOA agenda app…</div>;
  if (error && !items.length) return <div className="loading-screen error">{error}</div>;

  return (
    <>
      <div className="desktop-only">
        <DesktopShell
          meetings={meetings}
          grouped={grouped}
          selectedItem={selectedItem}
          selectedItemId={selectedItemId}
          setSelectedItemId={setSelectedItemId}
          stats={stats}
          error={error}
          notice={notice}
          loadData={loadData}
          saving={saving}
          draft={draft}
          setDraft={setDraft}
          createItem={createItem}
          creating={creating}
          updateSelectedItem={updateSelectedItem}
          docDraft={docDraft}
          setDocDraft={setDocDraft}
          linkSharePointDocument={linkSharePointDocument}
          linkingDocument={linkingDocument}
          uploadFile={uploadFile}
          setUploadFile={setUploadFile}
          uploadTitle={uploadTitle}
          setUploadTitle={setUploadTitle}
          uploadNotes={uploadNotes}
          setUploadNotes={setUploadNotes}
          uploadDocument={uploadDocument}
          uploadingDocument={uploadingDocument}
          meetingsList={meetings}
        />
      </div>

      <div className="mobile-only">
        <MobileShell
          meetings={meetings}
          grouped={grouped}
          selectedItem={selectedItem}
          stats={stats}
          error={error}
          notice={notice}
          loadData={loadData}
          saving={saving}
          draft={draft}
          setDraft={setDraft}
          createItem={createItem}
          creating={creating}
          updateSelectedItem={updateSelectedItem}
          docDraft={docDraft}
          setDocDraft={setDocDraft}
          linkSharePointDocument={linkSharePointDocument}
          linkingDocument={linkingDocument}
          uploadFile={uploadFile}
          setUploadFile={setUploadFile}
          uploadTitle={uploadTitle}
          setUploadTitle={setUploadTitle}
          uploadNotes={uploadNotes}
          setUploadNotes={setUploadNotes}
          uploadDocument={uploadDocument}
          uploadingDocument={uploadingDocument}
          meetingsList={meetings}
          mobileTab={mobileTab}
          setMobileTab={setMobileTab}
          onSelectItem={handleSelectItem}
        />
      </div>
    </>
  );
}

function DesktopShell(props: any) {
  const {
    meetings, grouped, selectedItem, selectedItemId, setSelectedItemId, stats, error, notice,
    loadData, saving, draft, setDraft, createItem, creating, updateSelectedItem,
    docDraft, setDocDraft, linkSharePointDocument, linkingDocument,
    uploadFile, setUploadFile, uploadTitle, setUploadTitle, uploadNotes, setUploadNotes,
    uploadDocument, uploadingDocument, meetingsList,
  } = props;

  return (
    <div className="app-shell desktop-shell">
      <aside className="sidebar panelish">
        <Brand title="Mission board" />
        <StatsGrid stats={stats} />
        <MeetingsPanel meetings={meetings} />
        <QuickAddPanel draft={draft} setDraft={setDraft} meetings={meetingsList} createItem={createItem} creating={creating} />
      </aside>

      <main className="main-panel panelish">
        <header className="topbar">
          <div>
            <div className="eyebrow">Overview</div>
            <h2>Board to-dos and agenda pipeline</h2>
          </div>
          <div className="topbar-note">Responsive split preview · desktop mode</div>
        </header>
        {error && <div className="error-banner">{error}</div>}
        {notice && <div className="notice-banner">{notice}</div>}
        <section className="lane-grid four-up">
          <Lane title="Next meeting" items={grouped.nextMeeting} onSelect={setSelectedItemId} selectedItemId={selectedItemId} />
          <Lane title="Board to-dos" items={grouped.todos} onSelect={setSelectedItemId} selectedItemId={selectedItemId} />
          <Lane title="Future" items={grouped.future} onSelect={setSelectedItemId} selectedItemId={selectedItemId} />
          <Lane title="Completed" items={grouped.completed} onSelect={setSelectedItemId} selectedItemId={selectedItemId} />
        </section>
      </main>

      <aside className="detail-panel panelish">
        <ItemDetail
          selectedItem={selectedItem}
          loadData={loadData}
          saving={saving}
          updateSelectedItem={updateSelectedItem}
          meetings={meetingsList}
          docDraft={docDraft}
          setDocDraft={setDocDraft}
          linkSharePointDocument={linkSharePointDocument}
          linkingDocument={linkingDocument}
          uploadFile={uploadFile}
          setUploadFile={setUploadFile}
          uploadTitle={uploadTitle}
          setUploadTitle={setUploadTitle}
          uploadNotes={uploadNotes}
          setUploadNotes={setUploadNotes}
          uploadDocument={uploadDocument}
          uploadingDocument={uploadingDocument}
          compact={false}
        />
      </aside>
    </div>
  );
}

function MobileShell(props: any) {
  const {
    meetings, grouped, selectedItem, stats, error, notice, loadData, saving, draft, setDraft,
    createItem, creating, updateSelectedItem, docDraft, setDocDraft, linkSharePointDocument,
    linkingDocument, uploadFile, setUploadFile, uploadTitle, setUploadTitle, uploadNotes,
    setUploadNotes, uploadDocument, uploadingDocument, meetingsList, mobileTab, setMobileTab, onSelectItem,
  } = props;

  return (
    <div className="app-shell mobile-shell">
      <header className="mobile-topbar panelish">
        <Brand title="Mobile preview" compact />
        <div className="topbar-actions">
          <button className="ghost-button" onClick={() => setMobileTab('board')}>Board</button>
          <button className="ghost-button" onClick={() => setMobileTab('item')} disabled={!selectedItem}>Item</button>
          <button className="primary-button" onClick={() => setMobileTab('add')}>Add</button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="notice-banner">{notice}</div>}
      <StatsGrid stats={stats} compact />

      {mobileTab === 'board' && (
        <main className="mobile-page">
          <MeetingsPanel meetings={meetings} compact />
          <MobileLane title="Next meeting" items={grouped.nextMeeting} onSelect={onSelectItem} />
          <MobileLane title="Board to-dos" items={grouped.todos} onSelect={onSelectItem} />
          <MobileLane title="Future" items={grouped.future} onSelect={onSelectItem} />
          <MobileLane title="Completed" items={grouped.completed} onSelect={onSelectItem} />
        </main>
      )}

      {mobileTab === 'item' && (
        <main className="mobile-page">
          <ItemDetail
            selectedItem={selectedItem}
            loadData={loadData}
            saving={saving}
            updateSelectedItem={updateSelectedItem}
            meetings={meetingsList}
            docDraft={docDraft}
            setDocDraft={setDocDraft}
            linkSharePointDocument={linkSharePointDocument}
            linkingDocument={linkingDocument}
            uploadFile={uploadFile}
            setUploadFile={setUploadFile}
            uploadTitle={uploadTitle}
            setUploadTitle={setUploadTitle}
            uploadNotes={uploadNotes}
            setUploadNotes={setUploadNotes}
            uploadDocument={uploadDocument}
            uploadingDocument={uploadingDocument}
            compact
          />
        </main>
      )}

      {mobileTab === 'add' && (
        <main className="mobile-page">
          <QuickAddPanel draft={draft} setDraft={setDraft} meetings={meetingsList} createItem={createItem} creating={creating} compact />
        </main>
      )}

      <nav className="mobile-bottom-nav panelish">
        <button className={`nav-button ${mobileTab === 'board' ? 'active' : ''}`} onClick={() => setMobileTab('board')}>Board</button>
        <button className={`nav-button ${mobileTab === 'item' ? 'active' : ''}`} onClick={() => setMobileTab('item')} disabled={!selectedItem}>Item</button>
        <button className={`nav-button ${mobileTab === 'add' ? 'active' : ''}`} onClick={() => setMobileTab('add')}>Add</button>
      </nav>
    </div>
  );
}

function Brand({ title, compact = false }: { title: string; compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'compact' : ''}`}>
      <div className="brand-mark">L</div>
      <div>
        <div className="eyebrow">HOA agenda</div>
        <h1>{title}</h1>
      </div>
    </div>
  );
}

function StatsGrid({ stats, compact = false }: { stats: { label: string; value: number }[]; compact?: boolean }) {
  return (
    <section className={`stats-grid ${compact ? 'compact' : ''}`}>
      {stats.map((stat) => (
        <div className="stat-card panelish" key={stat.label}>
          <div className="stat-label">{stat.label}</div>
          <div className={`stat-value ${compact ? 'compact' : ''}`}>{stat.value}</div>
        </div>
      ))}
    </section>
  );
}

function MeetingsPanel({ meetings, compact = false }: { meetings: Meeting[]; compact?: boolean }) {
  return (
    <section className={`sidebar-section ${compact ? 'mobile-section panelish' : ''}`}>
      <div className="section-heading">Upcoming meetings</div>
      <div className={`meeting-stack ${compact ? 'compact-stack' : ''}`}>
        {meetings.map((meeting) => (
          <div className={`meeting-card ${compact ? 'compact-card' : ''}`} key={meeting.id}>
            <div className="meeting-title">{meeting.title}</div>
            <div className="meeting-meta">{meeting.meeting_date}</div>
            {!compact && meeting.cadence_note && <div className="meeting-meta muted">{meeting.cadence_note}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

function QuickAddPanel({ draft, setDraft, meetings, createItem, creating, compact = false }: any) {
  return (
    <section className={`${compact ? 'mobile-section panelish' : 'sidebar-section form-section'}`}>
      <div className="section-heading">Quick add</div>
      <form className="quick-form" onSubmit={createItem}>
        <input value={draft.title} onChange={(e) => setDraft((d: DraftItem) => ({ ...d, title: e.target.value }))} placeholder="New item title" />
        <textarea value={draft.description} onChange={(e) => setDraft((d: DraftItem) => ({ ...d, description: e.target.value }))} placeholder="Short description" rows={3} />
        <div className="form-grid two-up">
          <select value={draft.kind} onChange={(e) => setDraft((d: DraftItem) => ({ ...d, kind: e.target.value }))}>
            {kindOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select value={draft.priority} onChange={(e) => setDraft((d: DraftItem) => ({ ...d, priority: e.target.value }))}>
            {priorityOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>
        <div className="form-grid two-up">
          <select value={draft.status} onChange={(e) => setDraft((d: DraftItem) => ({ ...d, status: e.target.value }))}>
            {statusOptions.map((option) => <option key={option} value={option}>{statusLabel[option]}</option>)}
          </select>
          <select value={draft.meeting_intent} onChange={(e) => setDraft((d: DraftItem) => ({ ...d, meeting_intent: e.target.value }))}>
            {meetingIntentOptions.map((option) => <option key={option} value={option}>{meetingIntentLabel[option]}</option>)}
          </select>
        </div>
        <select value={draft.target_meeting_id} onChange={(e) => setDraft((d: DraftItem) => ({ ...d, target_meeting_id: e.target.value }))}>
          <option value="">No meeting assigned</option>
          {meetings.map((meeting: Meeting) => <option key={meeting.id} value={meeting.id}>{meeting.title}</option>)}
        </select>
        <input value={draft.owner} onChange={(e) => setDraft((d: DraftItem) => ({ ...d, owner: e.target.value }))} placeholder="Owner" />
        <textarea value={draft.next_action} onChange={(e) => setDraft((d: DraftItem) => ({ ...d, next_action: e.target.value }))} placeholder="Next action" rows={2} />
        <textarea value={draft.notesText} onChange={(e) => setDraft((d: DraftItem) => ({ ...d, notesText: e.target.value }))} placeholder="Notes, one per line" rows={3} />
        <button className="primary-button full-width" type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create item'}</button>
      </form>
    </section>
  );
}

function ItemDetail(props: any) {
  const {
    selectedItem, loadData, saving, updateSelectedItem, meetings,
    docDraft, setDocDraft, linkSharePointDocument, linkingDocument,
    uploadFile, setUploadFile, uploadTitle, setUploadTitle, uploadNotes, setUploadNotes,
    uploadDocument, uploadingDocument, compact,
  } = props;

  if (!selectedItem) return <div className={`empty-detail ${compact ? 'panelish mobile-section' : ''}`}>Select an item to see details.</div>;

  return (
    <>
      <section className={`${compact ? 'mobile-section panelish' : ''}`}>
        <div className="detail-header-row">
          <div>
            <div className="eyebrow">Item detail</div>
            <h2 className={compact ? 'mobile-item-title' : ''}>{selectedItem.title}</h2>
          </div>
          <button className="ghost-button" onClick={() => void loadData()} disabled={saving}>{saving ? 'Saving…' : 'Refresh'}</button>
        </div>
        <div className="chip-row">
          <span className={`chip chip-status status-${selectedItem.status}`}>{statusLabel[selectedItem.status] || selectedItem.status}</span>
          <span className="chip">{selectedItem.kind === 'task' ? 'Board to-do' : 'Agenda candidate'}</span>
          {selectedItem.priority && <span className="chip">{selectedItem.priority}</span>}
        </div>
        {compact && (
          <div className="quick-actions-grid">
            <button className="ghost-button" onClick={() => void updateSelectedItem({ status: 'ready' }, 'Status set to ready')}>Mark ready</button>
            <button className="ghost-button" onClick={() => void updateSelectedItem({ meeting_intent: 'future' }, 'Meeting intent set to future')}>Move future</button>
            <button className="ghost-button" onClick={() => void updateSelectedItem({ status: 'completed' }, 'Status set to completed')}>Complete</button>
          </div>
        )}
      </section>

      <EditableField label="Description" value={selectedItem.description || ''} multiline onSave={(value) => updateSelectedItem({ description: value || null }, 'Description updated')} saving={saving} compact={compact} />
      <EditableField label="Next action" value={selectedItem.next_action || ''} multiline onSave={(value) => updateSelectedItem({ next_action: value || null }, 'Next action updated')} saving={saving} compact={compact} />
      <EditableField label="Notes" value={selectedItem.notes.join('\n')} multiline onSave={(value) => updateSelectedItem({ notes: value.split('\n').map((line: string) => line.trim()).filter(Boolean) }, 'Notes updated')} saving={saving} compact={compact} />

      <section className={`${compact ? 'mobile-section panelish' : 'detail-block form-block'}`}>
        <div className="detail-label">Workflow</div>
        <div className="form-grid two-up">
          <select value={selectedItem.status} onChange={(e) => void updateSelectedItem({ status: e.target.value }, `Status set to ${e.target.value}`)}>
            {statusOptions.map((option) => <option key={option} value={option}>{statusLabel[option]}</option>)}
          </select>
          <select value={selectedItem.meeting_intent || 'unscheduled'} onChange={(e) => void updateSelectedItem({ meeting_intent: e.target.value }, `Meeting intent set to ${e.target.value}`)}>
            {meetingIntentOptions.map((option) => <option key={option} value={option}>{meetingIntentLabel[option]}</option>)}
          </select>
        </div>
        <select value={selectedItem.target_meeting_id || ''} onChange={(e) => void updateSelectedItem({ target_meeting_id: e.target.value || null }, 'Target meeting updated')}>
          <option value="">No meeting assigned</option>
          {meetings.map((meeting: Meeting) => <option key={meeting.id} value={meeting.id}>{meeting.title}</option>)}
        </select>
      </section>

      <section className={`${compact ? 'mobile-section panelish' : 'detail-block form-block'}`}>
        <div className="detail-label">Documents</div>
        <div className="document-list">
          {(selectedItem.documents || []).length ? (
            (selectedItem.documents || []).map((doc: DocumentRecord) => (
              <a className="document-card" key={doc.id} href={doc.sharepoint_web_url || '#'} target="_blank" rel="noreferrer">
                <div className="document-title">{doc.title}</div>
                <div className="muted small-text">{doc.sharepoint_path || doc.source_type}</div>
                {doc.notes && <div className="muted small-text">{doc.notes}</div>}
              </a>
            ))
          ) : (
            <div className="empty-lane">No linked documents yet.</div>
          )}
        </div>
        <input value={docDraft.title} onChange={(e) => setDocDraft((d: any) => ({ ...d, title: e.target.value }))} placeholder="Document title" />
        <input value={docDraft.webUrl} onChange={(e) => setDocDraft((d: any) => ({ ...d, webUrl: e.target.value }))} placeholder="SharePoint document URL" />
        <input value={docDraft.path} onChange={(e) => setDocDraft((d: any) => ({ ...d, path: e.target.value }))} placeholder="SharePoint path / folder" />
        <textarea value={docDraft.notes} onChange={(e) => setDocDraft((d: any) => ({ ...d, notes: e.target.value }))} rows={2} placeholder="Document notes" />
        <div className="field-actions">
          <button className="ghost-button" type="button" onClick={() => setDocDraft({ title: '', webUrl: '', path: '', notes: '' })}>Clear</button>
          <button className="primary-button" type="button" onClick={() => void linkSharePointDocument()} disabled={linkingDocument}>{linkingDocument ? 'Linking…' : 'Link SharePoint document'}</button>
        </div>
        <div className="detail-label">Upload file to SharePoint</div>
        <input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
        {uploadFile && <div className="muted small-text">Selected file: {uploadFile.name}</div>}
        <input value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} placeholder="Optional display title" />
        <textarea value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} rows={2} placeholder="Upload notes" />
        <div className="field-actions">
          <button className="ghost-button" type="button" onClick={() => { setUploadFile(null); setUploadTitle(''); setUploadNotes(''); }}>Clear upload</button>
          <button className="primary-button" type="button" onClick={() => void uploadDocument()} disabled={uploadingDocument || !uploadFile}>{uploadingDocument ? 'Uploading…' : 'Upload to SharePoint'}</button>
        </div>
        {!compact && <div className="detail-footer muted">Updated {new Date(selectedItem.updated_at).toLocaleString()}</div>}
      </section>
    </>
  );
}

function EditableField({ label, value, onSave, multiline = false, saving, compact = false }: {
  label: string;
  value: string;
  onSave: (value: string) => Promise<void> | void;
  multiline?: boolean;
  saving: boolean;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <section className={`${compact ? 'mobile-section panelish' : 'detail-block form-block'}`}>
      <div className="detail-label">{label}</div>
      {multiline ? <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={label.includes('Notes') ? 5 : 3} /> : <input value={draft} onChange={(e) => setDraft(e.target.value)} />}
      <div className="field-actions">
        <button className="ghost-button" type="button" onClick={() => setDraft(value)} disabled={saving}>Reset</button>
        <button className="primary-button" type="button" onClick={() => void onSave(draft)} disabled={saving}>Save</button>
      </div>
    </section>
  );
}

function Lane({ title, items, onSelect, selectedItemId }: { title: string; items: AgendaItem[]; onSelect: (id: string) => void; selectedItemId: string | null; }) {
  return (
    <section className="lane panelish">
      <div className="lane-header">
        <h3>{title}</h3>
        <span>{items.length}</span>
      </div>
      <div className="lane-stack">
        {items.map((item) => (
          <button key={item.id} className={`issue-card ${selectedItemId === item.id ? 'active' : ''}`} onClick={() => onSelect(item.id)}>
            <div className="issue-meta-row">
              <span className={`dot status-${item.status}`} />
              <span className="issue-id">{item.id}</span>
            </div>
            <div className="issue-title">{item.title}</div>
            <div className="issue-subtitle">{item.description || 'No description yet.'}</div>
            <div className="issue-chip-row">
              <span className="mini-chip">{statusLabel[item.status] || item.status}</span>
              {item.priority && <span className="mini-chip">{item.priority}</span>}
              {item.target_meeting_title && <span className="mini-chip">{item.target_meeting_title.replace(' board meeting', '')}</span>}
            </div>
          </button>
        ))}
        {!items.length && <div className="empty-lane">Nothing here yet.</div>}
      </div>
    </section>
  );
}

function MobileLane({ title, items, onSelect }: { title: string; items: AgendaItem[]; onSelect: (id: string) => void; }) {
  return (
    <section className="mobile-section panelish">
      <div className="lane-header">
        <h3>{title}</h3>
        <span>{items.length}</span>
      </div>
      <div className="lane-stack mobile-list-stack">
        {items.map((item) => (
          <button key={item.id} className="issue-card mobile-issue-card" onClick={() => onSelect(item.id)}>
            <div className="issue-meta-row">
              <span className={`dot status-${item.status}`} />
              <span className="issue-id">{item.id}</span>
            </div>
            <div className="issue-title">{item.title}</div>
            <div className="issue-chip-row">
              <span className="mini-chip">{statusLabel[item.status] || item.status}</span>
              {item.target_meeting_title && <span className="mini-chip">{item.target_meeting_title.replace(' board meeting', '')}</span>}
            </div>
          </button>
        ))}
        {!items.length && <div className="empty-lane">Nothing here yet.</div>}
      </div>
    </section>
  );
}

export default App;
