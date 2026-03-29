import { AutomobileFormValues } from './types';

type AutomobileEditModalProps = {
  draft: AutomobileFormValues;
  isEditing: boolean;
  disabled?: boolean;
  onChange: (patch: Partial<AutomobileFormValues>) => void;
  onCancel: () => void;
  onSave: () => void;
};

export function AutomobileEditModal({
  draft,
  isEditing,
  disabled,
  onChange,
  onCancel,
  onSave,
}: AutomobileEditModalProps) {
  return (
    <div className="app-modal-backdrop" role="presentation" onClick={onCancel}>
      <section
        className="panelish app-modal-card automobile-modal"
        role="dialog"
        aria-modal="true"
        aria-label={isEditing ? 'Edit automobile' : 'Add automobile'}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="detail-header-row">
          <div>
            <div className="eyebrow">Automobile</div>
            <h3>{isEditing ? 'Edit automobile' : 'Add automobile'}</h3>
          </div>
        </div>
        <div className="form-grid two-up">
          <label>
            <div className="detail-label">License plate</div>
            <input
              autoFocus
              value={draft.license_plate}
              onChange={(event) => onChange({ license_plate: event.target.value })}
              disabled={disabled}
            />
          </label>
          <label>
            <div className="detail-label">Color</div>
            <input
              value={draft.color}
              onChange={(event) => onChange({ color: event.target.value })}
              disabled={disabled}
            />
          </label>
        </div>
        <div className="form-grid two-up">
          <label>
            <div className="detail-label">Make</div>
            <input
              value={draft.make}
              onChange={(event) => onChange({ make: event.target.value })}
              disabled={disabled}
            />
          </label>
          <label>
            <div className="detail-label">Model</div>
            <input
              value={draft.model}
              onChange={(event) => onChange({ model: event.target.value })}
              disabled={disabled}
            />
          </label>
        </div>
        <div className="field-actions">
          <button className="ghost-button" type="button" onClick={onCancel} disabled={disabled}>
            Cancel
          </button>
          <button className="primary-button" type="button" onClick={onSave} disabled={disabled}>
            {isEditing ? 'Save automobile' : 'Add automobile'}
          </button>
        </div>
      </section>
    </div>
  );
}
