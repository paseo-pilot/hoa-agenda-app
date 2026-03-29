import { useMemo, useState } from 'react';
import { AutomobileEditModal } from './AutomobileEditModal';
import { AutomobileFormValues, emptyAutomobile } from './types';

type EditableAutomobilesSectionProps = {
  automobiles: AutomobileFormValues[];
  title?: string;
  countLabel?: string;
  emptyMessage?: string;
  disabled?: boolean;
  footer?: string;
  onChange: (next: AutomobileFormValues[]) => void;
};

export function EditableAutomobilesSection({
  automobiles,
  title = 'Automobiles',
  countLabel,
  emptyMessage = 'No automobile records.',
  disabled,
  footer,
  onChange,
}: EditableAutomobilesSectionProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [modalDraft, setModalDraft] = useState<AutomobileFormValues>(emptyAutomobile());

  const isEditing = editingIndex != null;
  const sectionLabel = useMemo(
    () => `${title} (${countLabel || automobiles.length})`,
    [automobiles.length, countLabel, title],
  );

  const openCreateModal = () => {
    setEditingIndex(null);
    setModalDraft(emptyAutomobile());
    setIsModalOpen(true);
  };

  const openEditModal = (index: number) => {
    setEditingIndex(index);
    setModalDraft(automobiles[index]);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingIndex(null);
    setModalDraft(emptyAutomobile());
  };

  const saveModal = () => {
    if (editingIndex == null) {
      onChange([...automobiles, modalDraft]);
      closeModal();
      return;
    }

    const next = [...automobiles];
    next[editingIndex] = modalDraft;
    onChange(next);
    closeModal();
  };

  const removeRow = (index: number) => {
    onChange(automobiles.filter((_, rowIndex) => rowIndex !== index));
  };

  return (
    <div className="detail-block form-block homeowner-section-card">
      <div className="detail-header-row">
        <div className="detail-label">{sectionLabel}</div>
        <button type="button" className="ghost-button" onClick={openCreateModal} disabled={disabled}>
          + Add automobile
        </button>
      </div>

      {automobiles.length ? (
        <div className="homeowner-sublist">
          {automobiles.map((automobile, index) => (
            <div className="homeowner-sub-card" key={`auto-${index}`}>
              <div className="homeowner-sub-title">Automobile {index + 1}</div>
              <div className="form-grid two-up">
                <div>
                  <div className="detail-label">License plate</div>
                  <div>{automobile.license_plate || '—'}</div>
                </div>
                <div>
                  <div className="detail-label">Color</div>
                  <div>{automobile.color || '—'}</div>
                </div>
              </div>
              <div className="form-grid two-up">
                <div>
                  <div className="detail-label">Make</div>
                  <div>{automobile.make || '—'}</div>
                </div>
                <div>
                  <div className="detail-label">Model</div>
                  <div>{automobile.model || '—'}</div>
                </div>
              </div>
              <div className="homeowner-row-actions">
                <button type="button" className="ghost-button" onClick={() => openEditModal(index)} disabled={disabled}>
                  Edit
                </button>
                <button type="button" className="ghost-button danger-ghost" onClick={() => removeRow(index)} disabled={disabled}>
                  Remove row
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-lane homeowner-empty-inline">
          {emptyMessage}
          <button type="button" className="ghost-button" onClick={openCreateModal} disabled={disabled}>
            Add first automobile
          </button>
        </div>
      )}

      {footer && <div className="muted small-text automobile-section-footer">{footer}</div>}

      {isModalOpen && (
        <AutomobileEditModal
          draft={modalDraft}
          isEditing={isEditing}
          disabled={disabled}
          onChange={(patch) => setModalDraft((prev) => ({ ...prev, ...patch }))}
          onCancel={closeModal}
          onSave={saveModal}
        />
      )}
    </div>
  );
}
