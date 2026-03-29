import { Dispatch, FormEvent, SetStateAction, useEffect, useState } from 'react';
import {
  kindOptions,
  meetingIntentLabel,
  meetingIntentOptions,
  priorityOptions,
  statusLabel,
  statusOptions,
} from '../constants';
import { AgendaGroups, AgendaItem, DocumentRecord, DraftItem, LaneKey, Meeting, MobileTab } from '../types';

type UpdateAgendaItem = (patch: Partial<AgendaItem>, historyNote: string) => Promise<void>;
type ReorderItems = (laneKey: LaneKey, draggedId: string, targetId: string) => Promise<void>;

type SharedAgendaProps = {
  meetings: Meeting[];
  grouped: AgendaGroups;
  selectedItem: AgendaItem | null;
  draggedItemId: string | null;
  setDraggedItemId: Dispatch<SetStateAction<string | null>>;
  reorderItems: ReorderItems;
  stats: { label: string; value: number }[];
  error: string | null;
  notice: string | null;
  loadData: () => Promise<void>;
  saving: boolean;
  draft: DraftItem;
  setDraft: Dispatch<SetStateAction<DraftItem>>;
  createItem: (event: FormEvent) => Promise<void>;
  creating: boolean;
  updateSelectedItem: UpdateAgendaItem;
  uploadFile: File | null;
  setUploadFile: Dispatch<SetStateAction<File | null>>;
  uploadTitle: string;
  setUploadTitle: Dispatch<SetStateAction<string>>;
  uploadNotes: string;
  setUploadNotes: Dispatch<SetStateAction<string>>;
  uploadDocument: () => Promise<void>;
  uploadingDocument: boolean;
  removeDocument: (documentId: string) => Promise<void>;
  removingDocumentId: string | null;
};

type DesktopAgendaShellProps = SharedAgendaProps & {
  selectedItemId: string | null;
  setSelectedItemId: Dispatch<SetStateAction<string | null>>;
};

export function DesktopAgendaShell(props: DesktopAgendaShellProps) {
  const {
    meetings,
    grouped,
    selectedItem,
    selectedItemId,
    setSelectedItemId,
    draggedItemId,
    setDraggedItemId,
    reorderItems,
    stats,
    error,
    notice,
    loadData,
    saving,
    draft,
    setDraft,
    createItem,
    creating,
    updateSelectedItem,
    uploadFile,
    setUploadFile,
    uploadTitle,
    setUploadTitle,
    uploadNotes,
    setUploadNotes,
    uploadDocument,
    uploadingDocument,
    removeDocument,
    removingDocumentId,
  } = props;

  return (
    <div className="app-shell desktop-shell">
      <aside className="sidebar panelish">
        <Brand title="Mission board" />
        <StatsGrid stats={stats} />
        <MeetingsPanel meetings={meetings} />
        <QuickAddPanel draft={draft} setDraft={setDraft} meetings={meetings} createItem={createItem} creating={creating} />
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
          <Lane title="Next meeting" laneKey="nextMeeting" items={grouped.nextMeeting} onSelect={setSelectedItemId} selectedItemId={selectedItemId} draggedItemId={draggedItemId} setDraggedItemId={setDraggedItemId} reorderItems={reorderItems} />
          <Lane title="Board to-dos" laneKey="todos" items={grouped.todos} onSelect={setSelectedItemId} selectedItemId={selectedItemId} draggedItemId={draggedItemId} setDraggedItemId={setDraggedItemId} reorderItems={reorderItems} />
          <Lane title="Future" laneKey="future" items={grouped.future} onSelect={setSelectedItemId} selectedItemId={selectedItemId} draggedItemId={draggedItemId} setDraggedItemId={setDraggedItemId} reorderItems={reorderItems} />
          <Lane title="Completed" laneKey="completed" items={grouped.completed} onSelect={setSelectedItemId} selectedItemId={selectedItemId} draggedItemId={draggedItemId} setDraggedItemId={setDraggedItemId} reorderItems={reorderItems} />
        </section>
      </main>

      <aside className="detail-panel panelish">
        <ItemDetail
          selectedItem={selectedItem}
          loadData={loadData}
          saving={saving}
          updateSelectedItem={updateSelectedItem}
          meetings={meetings}
          uploadFile={uploadFile}
          setUploadFile={setUploadFile}
          uploadTitle={uploadTitle}
          setUploadTitle={setUploadTitle}
          uploadNotes={uploadNotes}
          setUploadNotes={setUploadNotes}
          uploadDocument={uploadDocument}
          uploadingDocument={uploadingDocument}
          removeDocument={removeDocument}
          removingDocumentId={removingDocumentId}
          compact={false}
        />
      </aside>
    </div>
  );
}

type MobileAgendaShellProps = SharedAgendaProps & {
  mobileTab: MobileTab;
  setMobileTab: Dispatch<SetStateAction<MobileTab>>;
  onSelectItem: (id: string) => void;
};

export function MobileAgendaShell(props: MobileAgendaShellProps) {
  const {
    meetings,
    grouped,
    selectedItem,
    draggedItemId,
    setDraggedItemId,
    reorderItems,
    stats,
    error,
    notice,
    loadData,
    saving,
    draft,
    setDraft,
    createItem,
    creating,
    updateSelectedItem,
    uploadFile,
    setUploadFile,
    uploadTitle,
    setUploadTitle,
    uploadNotes,
    setUploadNotes,
    uploadDocument,
    uploadingDocument,
    removeDocument,
    removingDocumentId,
    mobileTab,
    setMobileTab,
    onSelectItem,
  } = props;

  return (
    <div className="app-shell mobile-shell">
      <header className="mobile-topbar panelish">
        <div className="topbar-actions topbar-actions-full">
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
          <MobileLane title="Next meeting" laneKey="nextMeeting" items={grouped.nextMeeting} onSelect={onSelectItem} draggedItemId={draggedItemId} setDraggedItemId={setDraggedItemId} reorderItems={reorderItems} />
          <MobileLane title="Board to-dos" laneKey="todos" items={grouped.todos} onSelect={onSelectItem} draggedItemId={draggedItemId} setDraggedItemId={setDraggedItemId} reorderItems={reorderItems} />
          <MobileLane title="Future" laneKey="future" items={grouped.future} onSelect={onSelectItem} draggedItemId={draggedItemId} setDraggedItemId={setDraggedItemId} reorderItems={reorderItems} />
          <MobileLane title="Completed" laneKey="completed" items={grouped.completed} onSelect={onSelectItem} draggedItemId={draggedItemId} setDraggedItemId={setDraggedItemId} reorderItems={reorderItems} />
        </main>
      )}

      {mobileTab === 'item' && (
        <main className="mobile-page">
          <ItemDetail
            selectedItem={selectedItem}
            loadData={loadData}
            saving={saving}
            updateSelectedItem={updateSelectedItem}
            meetings={meetings}
            uploadFile={uploadFile}
            setUploadFile={setUploadFile}
            uploadTitle={uploadTitle}
            setUploadTitle={setUploadTitle}
            uploadNotes={uploadNotes}
            setUploadNotes={setUploadNotes}
            uploadDocument={uploadDocument}
            uploadingDocument={uploadingDocument}
            removeDocument={removeDocument}
            removingDocumentId={removingDocumentId}
            compact
          />
        </main>
      )}

      {mobileTab === 'add' && (
        <main className="mobile-page">
          <QuickAddPanel draft={draft} setDraft={setDraft} meetings={meetings} createItem={createItem} creating={creating} compact />
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

function QuickAddPanel({
  draft,
  setDraft,
  meetings,
  createItem,
  creating,
  compact = false,
}: {
  draft: DraftItem;
  setDraft: Dispatch<SetStateAction<DraftItem>>;
  meetings: Meeting[];
  createItem: (event: FormEvent) => Promise<void>;
  creating: boolean;
  compact?: boolean;
}) {
  return (
    <section className={`${compact ? 'mobile-section panelish' : 'sidebar-section form-section'}`}>
      <div className="section-heading">Quick add</div>
      <form className="quick-form" onSubmit={(event) => void createItem(event)}>
        <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="New item title" />
        <textarea value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} placeholder="Short description" rows={3} />
        <div className="form-grid two-up">
          <select value={draft.kind} onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value }))}>
            {kindOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select value={draft.priority} onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))}>
            {priorityOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>
        <div className="form-grid two-up">
          <select value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}>
            {statusOptions.map((option) => <option key={option} value={option}>{statusLabel[option]}</option>)}
          </select>
          <select value={draft.meeting_intent} onChange={(e) => setDraft((d) => ({ ...d, meeting_intent: e.target.value }))}>
            {meetingIntentOptions.map((option) => <option key={option} value={option}>{meetingIntentLabel[option]}</option>)}
          </select>
        </div>
        <select value={draft.target_meeting_id} onChange={(e) => setDraft((d) => ({ ...d, target_meeting_id: e.target.value }))}>
          <option value="">No meeting assigned</option>
          {meetings.map((meeting) => <option key={meeting.id} value={meeting.id}>{meeting.title}</option>)}
        </select>
        <input value={draft.owner} onChange={(e) => setDraft((d) => ({ ...d, owner: e.target.value }))} placeholder="Owner" />
        <textarea value={draft.next_action} onChange={(e) => setDraft((d) => ({ ...d, next_action: e.target.value }))} placeholder="Next action" rows={2} />
        <textarea value={draft.notesText} onChange={(e) => setDraft((d) => ({ ...d, notesText: e.target.value }))} placeholder="Notes, one per line" rows={3} />
        <button className="primary-button full-width" type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create item'}</button>
      </form>
    </section>
  );
}

function ItemDetail({
  selectedItem,
  loadData,
  saving,
  updateSelectedItem,
  meetings,
  uploadFile,
  setUploadFile,
  uploadTitle,
  setUploadTitle,
  uploadNotes,
  setUploadNotes,
  uploadDocument,
  uploadingDocument,
  removeDocument,
  removingDocumentId,
  compact,
}: {
  selectedItem: AgendaItem | null;
  loadData: () => Promise<void>;
  saving: boolean;
  updateSelectedItem: UpdateAgendaItem;
  meetings: Meeting[];
  uploadFile: File | null;
  setUploadFile: Dispatch<SetStateAction<File | null>>;
  uploadTitle: string;
  setUploadTitle: Dispatch<SetStateAction<string>>;
  uploadNotes: string;
  setUploadNotes: Dispatch<SetStateAction<string>>;
  uploadDocument: () => Promise<void>;
  uploadingDocument: boolean;
  removeDocument: (documentId: string) => Promise<void>;
  removingDocumentId: string | null;
  compact: boolean;
}) {
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
      <EditableField label="Notes" value={selectedItem.notes.join('\n')} multiline onSave={(value) => updateSelectedItem({ notes: value.split('\n').map((line) => line.trim()).filter(Boolean) }, 'Notes updated')} saving={saving} compact={compact} />

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
          {meetings.map((meeting) => <option key={meeting.id} value={meeting.id}>{meeting.title}</option>)}
        </select>
      </section>

      <section className={`${compact ? 'mobile-section panelish' : 'detail-block form-block'}`}>
        <div className="detail-label">Documents</div>
        <div className="document-list">
          {(selectedItem.documents || []).length ? (
            (selectedItem.documents || []).map((doc: DocumentRecord) => (
              <div className="document-card" key={doc.id}>
                <div className="document-title">{doc.title}</div>
                <div className="muted small-text document-meta-line">{doc.sharepoint_path || doc.source_type}</div>
                {doc.notes && <div className="muted small-text document-meta-line">{doc.notes}</div>}
                <div className="field-actions">
                  {doc.sharepoint_web_url ? (
                    <a
                      className="ghost-button document-action-link"
                      href={doc.sharepoint_web_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </a>
                  ) : (
                    <button className="ghost-button" type="button" disabled>No link</button>
                  )}
                  <button
                    className="ghost-button danger-ghost"
                    type="button"
                    onClick={() => void removeDocument(doc.id)}
                    disabled={removingDocumentId === doc.id}
                  >
                    {removingDocumentId === doc.id ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-lane">No uploaded documents yet.</div>
          )}
        </div>
        <div className="detail-label">Upload document</div>
        <input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
        {uploadFile && <div className="muted small-text">Selected file: {uploadFile.name}</div>}
        <input value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} placeholder="Optional display title" />
        <textarea value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} rows={2} placeholder="Upload notes" />
        <div className="field-actions">
          <button className="ghost-button" type="button" onClick={() => { setUploadFile(null); setUploadTitle(''); setUploadNotes(''); }}>Clear upload</button>
          <button className="primary-button" type="button" onClick={() => void uploadDocument()} disabled={uploadingDocument || !uploadFile}>{uploadingDocument ? 'Uploading…' : 'Upload document'}</button>
        </div>
        {!compact && <div className="detail-footer muted">Updated {new Date(selectedItem.updated_at).toLocaleString()}</div>}
      </section>
    </>
  );
}

function EditableField({
  label,
  value,
  onSave,
  multiline = false,
  saving,
  compact = false,
}: {
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

function Lane({
  title,
  laneKey,
  items,
  onSelect,
  selectedItemId,
  draggedItemId,
  setDraggedItemId,
  reorderItems,
}: {
  title: string;
  laneKey: LaneKey;
  items: AgendaItem[];
  onSelect: Dispatch<SetStateAction<string | null>>;
  selectedItemId: string | null;
  draggedItemId: string | null;
  setDraggedItemId: Dispatch<SetStateAction<string | null>>;
  reorderItems: ReorderItems;
}) {
  return (
    <section className="lane panelish">
      <div className="lane-header">
        <h3>{title}</h3>
        <span>{items.length}</span>
      </div>
      <div className="lane-stack">
        {items.map((item) => (
          <button
            key={item.id}
            className={`issue-card ${selectedItemId === item.id ? 'active' : ''} ${draggedItemId === item.id ? 'dragging' : ''}`}
            draggable
            onDragStart={() => setDraggedItemId(item.id)}
            onDragEnd={() => setDraggedItemId(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault();
              if (draggedItemId) await reorderItems(laneKey, draggedItemId, item.id);
              setDraggedItemId(null);
            }}
            onClick={() => onSelect(item.id)}
          >
            <div className="drag-handle-row">
              <span className="drag-grip">⋮⋮</span>
              <div className="issue-meta-row">
                <span className={`dot status-${item.status}`} />
                <span className="issue-id">{item.id}</span>
              </div>
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

function MobileLane({
  title,
  laneKey,
  items,
  onSelect,
  draggedItemId,
  setDraggedItemId,
  reorderItems,
}: {
  title: string;
  laneKey: LaneKey;
  items: AgendaItem[];
  onSelect: (id: string) => void;
  draggedItemId: string | null;
  setDraggedItemId: Dispatch<SetStateAction<string | null>>;
  reorderItems: ReorderItems;
}) {
  return (
    <section className="mobile-section panelish">
      <div className="lane-header">
        <h3>{title}</h3>
        <span>{items.length}</span>
      </div>
      <div className="lane-stack mobile-list-stack">
        {items.map((item) => (
          <button
            key={item.id}
            className={`issue-card mobile-issue-card ${draggedItemId === item.id ? 'dragging' : ''}`}
            draggable
            onDragStart={() => setDraggedItemId(item.id)}
            onDragEnd={() => setDraggedItemId(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault();
              if (draggedItemId) await reorderItems(laneKey, draggedItemId, item.id);
              setDraggedItemId(null);
            }}
            onClick={() => onSelect(item.id)}
          >
            <div className="drag-handle-row">
              <span className="drag-grip">⋮⋮</span>
              <div className="issue-meta-row">
                <span className={`dot status-${item.status}`} />
                <span className="issue-id">{item.id}</span>
              </div>
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
