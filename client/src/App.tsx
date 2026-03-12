import { useEffect, useMemo, useState } from 'react';

type Meeting = {
  id: string;
  title: string;
  meeting_date: string;
  cadence_note?: string | null;
  status: string;
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
  updated_at: string;
};

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

function App() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const apiBase = `${import.meta.env.BASE_URL}api`;

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [meetingsRes, itemsRes] = await Promise.all([fetch(`${apiBase}/meetings`), fetch(`${apiBase}/items`)]);
        if (!meetingsRes.ok || !itemsRes.ok) throw new Error('Failed to load app data');
        const [meetingsJson, itemsJson] = await Promise.all([meetingsRes.json(), itemsRes.json()]);
        setMeetings(meetingsJson);
        setItems(itemsJson);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const grouped = useMemo(() => {
    return {
      nextMeeting: items.filter((item) => item.meeting_intent === 'next_meeting' || item.meeting_intent === 'next_meeting_if_ready'),
      todos: items.filter((item) => item.kind === 'task' && item.status !== 'completed'),
      future: items.filter((item) => item.meeting_intent === 'future'),
      completed: items.filter((item) => item.status === 'completed'),
    };
  }, [items]);

  const selectedItem = items.find((item) => item.id === selectedItemId) ?? grouped.nextMeeting[0] ?? grouped.todos[0] ?? null;

  const stats = [
    { label: 'Total items', value: items.length },
    { label: 'Next meeting', value: grouped.nextMeeting.length },
    { label: 'Board to-dos', value: grouped.todos.length },
    { label: 'Completed', value: grouped.completed.length },
  ];

  if (loading) return <div className="loading-screen">Loading HOA agenda app…</div>;
  if (error) return <div className="loading-screen error">{error}</div>;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">L</div>
          <div>
            <div className="eyebrow">HOA agenda</div>
            <h1>Linear-style board</h1>
          </div>
        </div>

        <div className="stats-grid">
          {stats.map((stat) => (
            <div className="stat-card" key={stat.label}>
              <div className="stat-label">{stat.label}</div>
              <div className="stat-value">{stat.value}</div>
            </div>
          ))}
        </div>

        <section className="sidebar-section">
          <div className="section-heading">Upcoming meetings</div>
          <div className="meeting-stack">
            {meetings.map((meeting) => (
              <div className="meeting-card" key={meeting.id}>
                <div className="meeting-title">{meeting.title}</div>
                <div className="meeting-meta">{meeting.meeting_date}</div>
                {meeting.cadence_note && <div className="meeting-meta muted">{meeting.cadence_note}</div>}
              </div>
            ))}
          </div>
        </section>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <div className="eyebrow">Overview</div>
            <h2>Board to-dos and agenda pipeline</h2>
          </div>
          <div className="topbar-note">SQLite-backed · SharePoint-ready · served over Tailscale</div>
        </header>

        <section className="lane-grid">
          <Lane title="Next meeting" items={grouped.nextMeeting} onSelect={setSelectedItemId} selectedItemId={selectedItemId} />
          <Lane title="Board to-dos" items={grouped.todos} onSelect={setSelectedItemId} selectedItemId={selectedItemId} />
          <Lane title="Future" items={grouped.future} onSelect={setSelectedItemId} selectedItemId={selectedItemId} />
        </section>
      </main>

      <aside className="detail-panel">
        {selectedItem ? (
          <>
            <div className="eyebrow">Item detail</div>
            <h3>{selectedItem.title}</h3>
            <div className="chip-row">
              <span className={`chip chip-status status-${selectedItem.status}`}>{statusLabel[selectedItem.status] || selectedItem.status}</span>
              <span className="chip">{selectedItem.kind === 'task' ? 'Board to-do' : 'Agenda candidate'}</span>
              {selectedItem.category && <span className="chip">{selectedItem.category}</span>}
              {selectedItem.priority && <span className="chip">Priority: {selectedItem.priority}</span>}
            </div>

            <div className="detail-block">
              <div className="detail-label">Meeting intent</div>
              <div>{meetingIntentLabel[selectedItem.meeting_intent || ''] || 'Unscheduled'}</div>
              {selectedItem.target_meeting_title && <div className="muted">{selectedItem.target_meeting_title}</div>}
            </div>

            {selectedItem.description && (
              <div className="detail-block">
                <div className="detail-label">Description</div>
                <p>{selectedItem.description}</p>
              </div>
            )}

            {selectedItem.next_action && (
              <div className="detail-block">
                <div className="detail-label">Next action</div>
                <p>{selectedItem.next_action}</p>
              </div>
            )}

            {selectedItem.decision_needed && (
              <div className="detail-block">
                <div className="detail-label">Decision needed</div>
                <p>{selectedItem.decision_needed}</p>
              </div>
            )}

            <div className="detail-block">
              <div className="detail-label">Notes</div>
              <ul className="notes-list">
                {selectedItem.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>

            <div className="detail-footer muted">Updated {new Date(selectedItem.updated_at).toLocaleString()}</div>
          </>
        ) : (
          <div className="empty-detail">Select an item to see details.</div>
        )}
      </aside>
    </div>
  );
}

function Lane({
  title,
  items,
  onSelect,
  selectedItemId,
}: {
  title: string;
  items: AgendaItem[];
  onSelect: (id: string) => void;
  selectedItemId: string | null;
}) {
  return (
    <section className="lane">
      <div className="lane-header">
        <h3>{title}</h3>
        <span>{items.length}</span>
      </div>
      <div className="lane-stack">
        {items.map((item) => (
          <button
            key={item.id}
            className={`issue-card ${selectedItemId === item.id ? 'active' : ''}`}
            onClick={() => onSelect(item.id)}
          >
            <div className="issue-meta-row">
              <span className={`dot status-${item.status}`} />
              <span className="issue-id">{item.id}</span>
            </div>
            <div className="issue-title">{item.title}</div>
            <div className="issue-subtitle">{item.description || 'No description yet.'}</div>
            <div className="issue-chip-row">
              <span className="mini-chip">{statusLabel[item.status] || item.status}</span>
              {item.priority && <span className="mini-chip">{item.priority}</span>}
            </div>
          </button>
        ))}
        {items.length === 0 && <div className="empty-lane">Nothing here yet.</div>}
      </div>
    </section>
  );
}

export default App;
