import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { EditableAutomobilesSection, AutomobileFormValues } from './automobiles';
import { HomeownerSummary, HomeownerUpdateAutomobile, ParkingPermitDetail, ParkingPermitSummary, PermitStatus } from '../types';

type ParkingPermitsViewProps = {
  permits: ParkingPermitSummary[];
  selectedPermitId: number | null;
  selectedPermit: ParkingPermitDetail | null;
  loading: boolean;
  detailLoading: boolean;
  saving: boolean;
  deleting: boolean;
  years: string[];
  selectedYear: string;
  onYearChange: (year: string) => void;
  homeowners: HomeownerSummary[];
  onRefresh: () => Promise<void>;
  onSelectPermit: (permitId: number) => void;
  onCreatePermit: (payload: { homeowner_id: number; year?: string | null; status?: PermitStatus | null; permit_number?: string | null; notes?: string | null }) => Promise<void>;
  onSavePermit: (permitId: number, payload: { year?: string | null; status?: PermitStatus | null; permit_number?: string | null; notes?: string | null }) => Promise<void>;
  onSaveAutomobiles: (homeownerId: number, automobiles: HomeownerUpdateAutomobile[]) => Promise<void>;
  onDeletePermit: (permitId: number) => Promise<void>;
  onUploadPermitDocument: (permitId: number, payload: { filename: string; document_title?: string | null; notes?: string | null; mime_type?: string | null; content_base64: string }) => Promise<void>;
  onRemovePermitDocument: (permitId: number, documentId: string) => Promise<void>;
  error: string | null;
};

type PermitForm = {
  year: string;
  status: PermitStatus;
  permit_number: string;
  notes: string;
};

const permitStatusOptions: PermitStatus[] = ['Pending', 'Approved', 'Denied'];

function normalizeText(value: string) {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function ParkingPermitsView({
  permits,
  selectedPermitId,
  selectedPermit,
  loading,
  detailLoading,
  saving,
  deleting,
  years,
  selectedYear,
  onYearChange,
  homeowners,
  onRefresh,
  onSelectPermit,
  onCreatePermit,
  onSavePermit,
  onSaveAutomobiles,
  onDeletePermit,
  onUploadPermitDocument,
  onRemovePermitDocument,
  error,
}: ParkingPermitsViewProps) {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createHomeownerId, setCreateHomeownerId] = useState<number | null>(null);
  const [createForm, setCreateForm] = useState<PermitForm>({ year: '', status: 'Pending', permit_number: '', notes: '' });
  const [savingCreate, setSavingCreate] = useState(false);
  const [editForm, setEditForm] = useState<PermitForm | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [removingDocumentId, setRemovingDocumentId] = useState<string | null>(null);
  const [automobilesForm, setAutomobilesForm] = useState<AutomobileFormValues[]>([]);
  const [savingAutomobiles, setSavingAutomobiles] = useState(false);

  const homeownerOptions = useMemo(() => homeowners.slice().sort((a, b) => (
    a.unit_display.localeCompare(b.unit_display, undefined, { numeric: true, sensitivity: 'base' })
  )), [homeowners]);

  const selectedPermitDirty = Boolean(
    selectedPermit
      && editForm
      && (
        (selectedPermit.year || '') !== editForm.year
        || selectedPermit.status !== editForm.status
        || (selectedPermit.permit_number || '') !== editForm.permit_number
        || (selectedPermit.notes || '') !== editForm.notes
      ),
  );

  useEffect(() => {
    if (!selectedPermit) {
      setEditForm(null);
      return;
    }
    setEditForm({
      year: selectedPermit.year || '',
      status: selectedPermit.status,
      permit_number: selectedPermit.permit_number || '',
      notes: selectedPermit.notes || '',
    });
  }, [selectedPermit?.id, selectedPermit?.updated_at]);

  useEffect(() => {
    if (!selectedPermit) {
      setAutomobilesForm([]);
      return;
    }
    setAutomobilesForm((selectedPermit.automobiles || []).map((automobile) => ({
      license_plate: automobile.license_plate || '',
      make: automobile.make || '',
      model: automobile.model || '',
      color: automobile.color || '',
    })));
  }, [selectedPermit?.id, selectedPermit?.updated_at]);

  const onSelect = (permitId: number) => {
    onSelectPermit(permitId);
    setUploadFile(null);
    setUploadTitle('');
    setUploadNotes('');
  };

  const selectedAutomobilesDirty = Boolean(
    selectedPermit
    && JSON.stringify((selectedPermit.automobiles || []).map((automobile) => ({
      license_plate: automobile.license_plate || '',
      make: automobile.make || '',
      model: automobile.model || '',
      color: automobile.color || '',
    }))) !== JSON.stringify(automobilesForm),
  );

  const createPermit = async () => {
    if (!createHomeownerId) {
      toast.error('Choose a homeowner/unit first');
      return;
    }
    if (!/^\d{4}$/.test(createForm.year.trim())) {
      toast.error('Permit year must be 4 digits');
      return;
    }

    setSavingCreate(true);
    try {
      await onCreatePermit({
        homeowner_id: createHomeownerId,
        year: normalizeText(createForm.year),
        status: createForm.status,
        permit_number: normalizeText(createForm.permit_number),
        notes: normalizeText(createForm.notes),
      });
      setCreateHomeownerId(null);
      setCreateForm({ year: '', status: 'Pending', permit_number: '', notes: '' });
      setCreateModalOpen(false);
      toast.success('Permit record added');
    } catch (err) {
      toast.error((err as Error).message || 'Failed to add permit');
    } finally {
      setSavingCreate(false);
    }
  };

  const savePermit = async () => {
    if (!selectedPermit || !editForm) return;
    if (!/^\d{4}$/.test(editForm.year.trim())) {
      toast.error('Permit year must be 4 digits');
      return;
    }

    try {
      await onSavePermit(selectedPermit.id, {
        year: normalizeText(editForm.year),
        status: editForm.status,
        permit_number: normalizeText(editForm.permit_number),
        notes: normalizeText(editForm.notes),
      });
      toast.success('Permit updated');
    } catch (err) {
      toast.error((err as Error).message || 'Failed to save permit');
    }
  };

  const deletePermit = async () => {
    if (!selectedPermit) return;
    const confirmed = window.confirm('Delete this permit record? This also removes attached permit documents.');
    if (!confirmed) return;
    try {
      await onDeletePermit(selectedPermit.id);
      toast.success('Permit deleted');
    } catch (err) {
      toast.error((err as Error).message || 'Failed to delete permit');
    }
  };

  const handlePermitFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setUploadFile(event.target.files?.[0] || null);
  };

  const uploadDocument = async () => {
    if (!selectedPermit || !uploadFile) return;
    setUploadingDocument(true);
    try {
      const buffer = await uploadFile.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const contentBase64 = btoa(binary);
      await onUploadPermitDocument(selectedPermit.id, {
        filename: uploadFile.name,
        document_title: normalizeText(uploadTitle) || uploadFile.name,
        notes: normalizeText(uploadNotes),
        mime_type: uploadFile.type || 'application/octet-stream',
        content_base64: contentBase64,
      });
      setUploadFile(null);
      setUploadTitle('');
      setUploadNotes('');
      toast.success(`Uploaded ${uploadFile.name}`);
    } catch (err) {
      toast.error((err as Error).message || 'Failed to upload document');
    } finally {
      setUploadingDocument(false);
    }
  };

  const removeDocument = async (documentId: string) => {
    if (!selectedPermit) return;
    setRemovingDocumentId(documentId);
    try {
      await onRemovePermitDocument(selectedPermit.id, documentId);
      toast.success('Document removed');
    } catch (err) {
      toast.error((err as Error).message || 'Failed to remove document');
    } finally {
      setRemovingDocumentId(null);
    }
  };

  const saveAutomobiles = async () => {
    if (!selectedPermit) return;
    setSavingAutomobiles(true);
    try {
      await onSaveAutomobiles(
        selectedPermit.homeowner_id,
        automobilesForm
          .map((automobile) => ({
            license_plate: normalizeText(automobile.license_plate),
            make: normalizeText(automobile.make),
            model: normalizeText(automobile.model),
            color: normalizeText(automobile.color),
          }))
          .filter((automobile) => automobile.license_plate || automobile.make || automobile.model || automobile.color),
      );
      toast.success('Automobiles updated');
    } catch (err) {
      toast.error((err as Error).message || 'Failed to save automobiles');
    } finally {
      setSavingAutomobiles(false);
    }
  };

  return (
    <div className="homeowners-shell parking-permits-shell">
      <section className="panelish homeowners-list-panel">
        <div className="homeowners-toolbar">
          <div>
            <div className="eyebrow">Directory</div>
            <h2>Parking Permits</h2>
          </div>
          <div className="parking-permit-toolbar-actions">
            <button className="primary-button" type="button" onClick={() => setCreateModalOpen(true)}>
              Add permit
            </button>
            <button className="ghost-button" onClick={() => void onRefresh()} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        <label>
          <div className="detail-label">Year filter</div>
          <select value={selectedYear} onChange={(event) => onYearChange(event.target.value)}>
            <option value="">All years</option>
            {years.map((year) => <option value={year} key={year}>{year}</option>)}
          </select>
        </label>

        {error && <div className="error-banner">{error}</div>}

        <div className="homeowners-list parking-permit-list">
          <div className="parking-permit-table-header parking-permit-table-grid" aria-hidden="true">
            <div>Unit</div>
            <div>Homeowners</div>
            <div>Year</div>
            <div>Status</div>
            <div>Permit #</div>
            <div>Docs</div>
          </div>
          <div className="parking-permit-table-body">
            {permits.map((permit) => (
              <button
                type="button"
                className={`parking-permit-table-row parking-permit-table-grid ${selectedPermitId === permit.id ? 'active' : ''}`}
                key={permit.id}
                onClick={() => onSelect(permit.id)}
              >
                <div className="parking-permit-cell unit-cell" data-label="Unit">Unit {permit.unit_display || 'N/A'}</div>
                <div className="parking-permit-cell" data-label="Homeowners">{(permit.homeowner_names || []).length ? permit.homeowner_names.join(', ') : 'No homeowner names listed'}</div>
                <div className="parking-permit-cell" data-label="Year">{permit.year || 'N/A'}</div>
                <div className="parking-permit-cell" data-label="Status">
                  <span className="mini-chip">{permit.status}</span>
                </div>
                <div className="parking-permit-cell" data-label="Permit #">{permit.permit_number || 'No permit #'}</div>
                <div className="parking-permit-cell" data-label="Docs">{permit.document_count}</div>
              </button>
            ))}
            {!permits.length && !loading && <div className="empty-lane">No permit records for this filter.</div>}
          </div>
        </div>
      </section>

      <section className="panelish homeowners-detail-panel parking-permit-detail-panel">
        {!selectedPermit && !detailLoading && <div className="empty-detail">Select a permit record to view details.</div>}
        {detailLoading && <div className="empty-detail">Loading permit details…</div>}
        {selectedPermit && editForm && (
          <>
            <div className="detail-header-row">
              <div>
                <div className="eyebrow">Permit detail</div>
                <h2>Unit {selectedPermit.unit_display} · {selectedPermit.account_number}</h2>
              </div>
              <div className="chip-row">
                <span className="chip">{selectedPermit.status}</span>
                {selectedPermitDirty && <span className="chip chip-warning">Unsaved changes</span>}
              </div>
            </div>

            <div className="parking-permit-detail-split">
              <div className="parking-permit-half">
                <div className="detail-block form-block homeowner-section-card">
                  <div className="detail-label">Permit Detail</div>
                  <div className="chip-row compact-chips">
                    {selectedPermit.homeowner_names.length
                      ? selectedPermit.homeowner_names.map((name, index) => <span className="mini-chip" key={`selected-owner-${index}`}>{name}</span>)
                      : <span className="muted small-text">No homeowner names listed</span>}
                  </div>

                  <div className="form-grid two-up">
                    <label>
                      <div className="detail-label">Year</div>
                      <input value={editForm.year} onChange={(event) => setEditForm((prev) => (prev ? { ...prev, year: event.target.value } : prev))} />
                    </label>
                    <label>
                      <div className="detail-label">Status</div>
                      <select
                        value={editForm.status}
                        onChange={(event) => setEditForm((prev) => (prev ? { ...prev, status: event.target.value as PermitStatus } : prev))}
                      >
                        {permitStatusOptions.map((option) => <option value={option} key={option}>{option}</option>)}
                      </select>
                    </label>
                  </div>
                  <label>
                    <div className="detail-label">Permit number</div>
                    <input
                      value={editForm.permit_number}
                      onChange={(event) => setEditForm((prev) => (prev ? { ...prev, permit_number: event.target.value } : prev))}
                    />
                  </label>
                  <label>
                    <div className="detail-label">Permit note</div>
                    <textarea
                      rows={3}
                      value={editForm.notes}
                      onChange={(event) => setEditForm((prev) => (prev ? { ...prev, notes: event.target.value } : prev))}
                    />
                  </label>
                  <div className="field-actions">
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => setEditForm({
                        year: selectedPermit.year || '',
                        status: selectedPermit.status,
                        permit_number: selectedPermit.permit_number || '',
                        notes: selectedPermit.notes || '',
                      })}
                      disabled={!selectedPermitDirty || saving}
                    >
                      Reset
                    </button>
                    <button className="primary-button" type="button" onClick={() => void savePermit()} disabled={!selectedPermitDirty || saving}>
                      {saving ? 'Saving…' : 'Save permit'}
                    </button>
                    <button className="ghost-button danger-ghost" type="button" onClick={() => void deletePermit()} disabled={deleting}>
                      {deleting ? 'Deleting…' : 'Delete permit'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="parking-permit-half">
                <EditableAutomobilesSection
                  automobiles={automobilesForm}
                  emptyMessage="No automobiles recorded for this unit."
                  disabled={savingAutomobiles}
                  onChange={setAutomobilesForm}
                />
                <div className="field-actions automobile-actions">
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => {
                      setAutomobilesForm((selectedPermit.automobiles || []).map((automobile) => ({
                        license_plate: automobile.license_plate || '',
                        make: automobile.make || '',
                        model: automobile.model || '',
                        color: automobile.color || '',
                      })));
                    }}
                    disabled={!selectedAutomobilesDirty || savingAutomobiles}
                  >
                    Reset automobiles
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void saveAutomobiles()}
                    disabled={!selectedAutomobilesDirty || savingAutomobiles}
                  >
                    {savingAutomobiles ? 'Saving…' : 'Save automobiles'}
                  </button>
                </div>
              </div>
            </div>

            <div className="detail-block form-block homeowner-section-card">
              <div className="detail-label">Documents</div>
              <div className="document-list">
                {(selectedPermit.documents || []).length ? (
                  (selectedPermit.documents || []).map((doc) => (
                    <div className="document-card" key={doc.id}>
                      <div className="document-title">{doc.title}</div>
                      <div className="muted small-text document-meta-line">{doc.sharepoint_path || doc.source_type}</div>
                      {doc.notes && <div className="muted small-text document-meta-line">{doc.notes}</div>}
                      <div className="field-actions">
                        {doc.sharepoint_web_url
                          ? <a className="ghost-button document-action-link" href={doc.sharepoint_web_url} target="_blank" rel="noreferrer">Open</a>
                          : <button className="ghost-button" type="button" disabled>No link</button>}
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
              <input type="file" onChange={handlePermitFileChange} />
              {uploadFile && <div className="muted small-text">Selected file: {uploadFile.name}</div>}
              <input value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} placeholder="Optional display title" />
              <textarea value={uploadNotes} onChange={(event) => setUploadNotes(event.target.value)} rows={2} placeholder="Upload notes" />
              <div className="field-actions">
                <button className="ghost-button" type="button" onClick={() => { setUploadFile(null); setUploadTitle(''); setUploadNotes(''); }}>
                  Clear upload
                </button>
                <button className="primary-button" type="button" onClick={() => void uploadDocument()} disabled={uploadingDocument || !uploadFile}>
                  {uploadingDocument ? 'Uploading…' : 'Upload document'}
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {createModalOpen && (
        <div className="app-modal-backdrop" role="presentation" onClick={() => setCreateModalOpen(false)}>
          <section
            className="panelish app-modal-card permit-create-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Add parking permit"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="detail-header-row">
              <div>
                <div className="eyebrow">Create permit</div>
                <h3>Add parking permit</h3>
              </div>
            </div>
            <label>
              <div className="detail-label">Homeowner / Unit</div>
              <select
                value={createHomeownerId || ''}
                onChange={(event) => setCreateHomeownerId(event.target.value ? Number(event.target.value) : null)}
              >
                <option value="">Select homeowner</option>
                {homeownerOptions.map((homeowner) => (
                  <option value={homeowner.id} key={homeowner.id}>Unit {homeowner.unit_display} · {homeowner.account_number}</option>
                ))}
              </select>
            </label>
            <div className="form-grid two-up">
              <label>
                <div className="detail-label">Year</div>
                <input value={createForm.year} onChange={(event) => setCreateForm((prev) => ({ ...prev, year: event.target.value }))} />
              </label>
              <label>
                <div className="detail-label">Status</div>
                <select value={createForm.status} onChange={(event) => setCreateForm((prev) => ({ ...prev, status: event.target.value as PermitStatus }))}>
                  {permitStatusOptions.map((option) => <option value={option} key={option}>{option}</option>)}
                </select>
              </label>
            </div>
            <label>
              <div className="detail-label">Permit number</div>
              <input value={createForm.permit_number} onChange={(event) => setCreateForm((prev) => ({ ...prev, permit_number: event.target.value }))} />
            </label>
            <label>
              <div className="detail-label">Permit note</div>
              <textarea
                rows={3}
                value={createForm.notes}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </label>
            <div className="field-actions">
              <button className="ghost-button" type="button" onClick={() => setCreateModalOpen(false)} disabled={savingCreate}>
                Cancel
              </button>
              <button className="primary-button" type="button" onClick={() => void createPermit()} disabled={savingCreate}>
                {savingCreate ? 'Adding…' : 'Add permit'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
