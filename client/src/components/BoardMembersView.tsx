import { BoardMember } from '../types';

type BoardMembersViewProps = {
  members: BoardMember[];
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
};

function prettyUnit(value: string) {
  const unit = String(value || '').trim();
  return unit || 'N/A';
}

export function BoardMembersView({ members, loading, error, onRefresh }: BoardMembersViewProps) {
  return (
    <section className="panelish board-members-panel">
      <div className="homeowners-toolbar">
        <div>
          <div className="eyebrow">Directory</div>
          <h2>Board Members</h2>
        </div>
        <button type="button" className="ghost-button" onClick={onRefresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      {!loading && !members.length ? (
        <div className="empty-detail board-members-empty">
          <div>No board members are currently flagged.</div>
          <div className="small-text">Mark a contact as a board member in the Homeowners module to show them here.</div>
        </div>
      ) : null}

      <div className="board-members-list">
        {members.map((member) => (
          <article className="board-member-card" key={member.contact_id}>
            <div className="topbar">
              <div>
                <div className="meeting-title">{member.name}</div>
                <div className="meeting-meta">Unit {prettyUnit(member.unit_display)} · {member.account_number}</div>
              </div>
              {member.role ? <span className="chip">{member.role}</span> : null}
            </div>

            <div className="board-member-contact-grid">
              <div>
                <div className="detail-label">Email</div>
                <div className="muted">{member.email || 'Not provided'}</div>
              </div>
              <div>
                <div className="detail-label">Phone</div>
                <div className="muted">{member.phone || 'Not provided'}</div>
              </div>
            </div>

            {member.property_address ? (
              <div>
                <div className="detail-label">Property address</div>
                <div className="small-text">{member.property_address}</div>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
