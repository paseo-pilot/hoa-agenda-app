import { HomeownerSummary } from '../../types';

type HomeownersDirectoryProps = {
  items: HomeownerSummary[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  listLoading: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  onRefresh: () => Promise<void>;
  error: string | null;
};

export function HomeownersDirectory({
  items,
  selectedId,
  onSelect,
  listLoading,
  query,
  onQueryChange,
  onRefresh,
  error,
}: HomeownersDirectoryProps) {
  return (
    <section className="panelish homeowners-list-panel">
      <div className="homeowners-toolbar">
        <div>
          <div className="eyebrow">Directory</div>
          <h2>Homeowners</h2>
        </div>
        <button className="ghost-button" onClick={() => void onRefresh()} disabled={listLoading}>
          {listLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search unit, account, address, owner name, email, notes..."
      />
      <div className="muted small-text">{items.length} records</div>
      {error && <div className="error-banner">{error}</div>}
      <div className="homeowners-list">
        {items.map((homeowner) => (
          (() => {
            const contactNames = (homeowner.contact_names || [])
              .map((name) => String(name).trim())
              .filter(Boolean);

            return (
              <button
                type="button"
                key={homeowner.id}
                className={`homeowner-list-row ${selectedId === homeowner.id ? 'active' : ''}`}
                onClick={() => onSelect(homeowner.id)}
              >
                <div className="homeowner-list-row-top">
                  <div className="homeowner-unit">Unit {homeowner.unit_display || 'N/A'}</div>
                  <div className="homeowner-account">{homeowner.account_number}</div>
                </div>
                <div className="chip-row compact-chips homeowner-contact-row">
                  {contactNames.length ? (
                    contactNames.map((name, index) => (
                      <span className="mini-chip" key={`${homeowner.id}-contact-${index}`}>
                        {name}
                      </span>
                    ))
                  ) : (
                    <span className="muted small-text">No contacts listed</span>
                  )}
                </div>
                <div className="chip-row compact-chips">
                  <span className="mini-chip">{homeowner.is_rental ? 'Rental' : 'Owner occupied'}</span>
                  <span className="mini-chip">{homeowner.contact_count} contacts</span>
                  <span className="mini-chip">{homeowner.permit_count} permits</span>
                  <span className="mini-chip">{homeowner.automobile_count} autos</span>
                </div>
              </button>
            );
          })()
        ))}
        {!items.length && !listLoading && <div className="empty-lane">No homeowner records found.</div>}
      </div>
    </section>
  );
}
