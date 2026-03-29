import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { EditableAutomobilesSection, AutomobileFormValues } from '../automobiles';
import { HomeownerDetail, HomeownerUpdatePayload, PermitStatus } from '../../types';

type HomeownerEditorProps = {
  detail: HomeownerDetail | null;
  detailLoading: boolean;
  saving: boolean;
  onSave: (id: number, payload: HomeownerUpdatePayload) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
  onUploadPermitDocument: (permitId: number, payload: { filename: string; document_title?: string | null; notes?: string | null; mime_type?: string | null; content_base64: string }) => Promise<void>;
  onRemovePermitDocument: (permitId: number, documentId: string) => Promise<void>;
};

type ContactDraft = {
  name: string;
  email: string;
  phone: string;
  role: string;
  is_board_member: boolean;
};

type PermitDraft = {
  id?: number;
  year: string;
  status: PermitStatus;
  permit_number: string;
  notes: string;
};

type HomeownerDraft = {
  mailing_address: string;
  is_rental: boolean;
  source_email: string;
  notes: string;
  contacts: ContactDraft[];
  parking_permits: PermitDraft[];
  automobiles: AutomobileFormValues[];
};

const permitStatusOptions: PermitStatus[] = ['Pending', 'Approved', 'Denied'];

const emptyContact = (): ContactDraft => ({ name: '', email: '', phone: '', role: '', is_board_member: false });
const emptyPermit = (): PermitDraft => ({ year: '', status: 'Pending', permit_number: '', notes: '' });

function buildDraft(detail: HomeownerDetail | null): HomeownerDraft | null {
  if (!detail) return null;
  return {
    mailing_address: detail.mailing_address || '',
    is_rental: detail.is_rental,
    source_email: detail.source_email || '',
    notes: detail.notes || '',
    contacts: detail.contacts.map((contact) => ({
      name: contact.name || '',
      email: contact.email || '',
      phone: contact.phone || '',
      role: contact.role || '',
      is_board_member: Boolean(contact.is_board_member),
    })),
    parking_permits: detail.parking_permits.map((permit) => ({
      id: permit.id,
      year: permit.year || '',
      status: permitStatusOptions.includes(permit.status) ? permit.status : 'Pending',
      permit_number: permit.permit_number || '',
      notes: permit.notes || '',
    })),
    automobiles: detail.automobiles.map((automobile) => ({
      license_plate: automobile.license_plate || '',
      make: automobile.make || '',
      model: automobile.model || '',
      color: automobile.color || '',
    })),
  };
}

function normalizeText(value: string) {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function hasValue(value: string) {
  return value.trim().length > 0;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function getValidationErrors(draft: HomeownerDraft) {
  const errors: string[] = [];

  if (hasValue(draft.source_email) && !isValidEmail(draft.source_email)) {
    errors.push('Source email must be a valid email address.');
  }

  draft.contacts.forEach((contact, index) => {
    if (hasValue(contact.email) && !isValidEmail(contact.email)) {
      errors.push(`Contact ${index + 1}: email must be valid.`);
    }
  });

  draft.parking_permits.forEach((permit, index) => {
    const year = permit.year.trim();
    if (year && !/^\d{4}$/.test(year)) {
      errors.push(`Parking permit ${index + 1}: year must be 4 digits.`);
    }
  });

  return errors;
}

export function HomeownerEditor({
  detail,
  detailLoading,
  saving,
  onSave,
  onDirtyChange,
  onUploadPermitDocument,
  onRemovePermitDocument,
}: HomeownerEditorProps) {
  const [draft, setDraft] = useState<HomeownerDraft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [permitUploadFiles, setPermitUploadFiles] = useState<Record<number, File | null>>({});
  const [permitUploadTitles, setPermitUploadTitles] = useState<Record<number, string>>({});
  const [permitUploadNotes, setPermitUploadNotes] = useState<Record<number, string>>({});
  const [uploadingPermitId, setUploadingPermitId] = useState<number | null>(null);
  const [removingDocumentId, setRemovingDocumentId] = useState<string | null>(null);

  useEffect(() => {
    setDraft(buildDraft(detail));
    setSaveError(null);
    setPermitUploadFiles({});
    setPermitUploadTitles({});
    setPermitUploadNotes({});
  }, [detail?.id, detail?.updated_at]);

  const dirty = useMemo(() => {
    if (!detail || !draft) return false;
    return JSON.stringify(buildDraft(detail)) !== JSON.stringify(draft);
  }, [detail, draft]);

  const validationErrors = useMemo(() => {
    if (!draft) return [];
    return getValidationErrors(draft);
  }, [draft]);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  if (!detail && !detailLoading) return <div className="empty-detail">Select a homeowner record to view details.</div>;
  if (detailLoading) return <div className="empty-detail">Loading homeowner details…</div>;
  if (!detail || !draft) return null;

  const updateContact = (index: number, patch: Partial<ContactDraft>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = [...prev.contacts];
      next[index] = { ...next[index], ...patch };
      return { ...prev, contacts: next };
    });
  };

  const updatePermit = (index: number, patch: Partial<PermitDraft>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = [...prev.parking_permits];
      next[index] = { ...next[index], ...patch };
      return { ...prev, parking_permits: next };
    });
  };

  const reset = () => {
    setDraft(buildDraft(detail));
    setSaveError(null);
  };

  const save = async () => {
    if (validationErrors.length) {
      setSaveError('Resolve validation errors before saving.');
      return;
    }

    const contacts = draft.contacts
      .map((contact) => ({
        name: contact.name.trim(),
        email: normalizeText(contact.email),
        phone: normalizeText(contact.phone),
        role: normalizeText(contact.role),
        is_board_member: contact.is_board_member,
      }))
      .filter((contact) => contact.name || contact.email || contact.phone || contact.role || contact.is_board_member)
      .map((contact) => ({
        ...contact,
        name: contact.name || '(Unnamed contact)',
      }));

    const parkingPermits = draft.parking_permits
      .map((permit) => ({
        id: permit.id,
        year: normalizeText(permit.year),
        status: permit.status,
        permit_number: normalizeText(permit.permit_number),
        notes: normalizeText(permit.notes),
      }))
      .filter((permit) => permit.id || permit.year || permit.permit_number);

    const automobiles = draft.automobiles
      .map((automobile) => ({
        license_plate: normalizeText(automobile.license_plate),
        make: normalizeText(automobile.make),
        model: normalizeText(automobile.model),
        color: normalizeText(automobile.color),
      }))
      .filter((automobile) => automobile.license_plate || automobile.make || automobile.model || automobile.color);

    try {
      setSaveError(null);
      await onSave(detail.id, {
        mailing_address: normalizeText(draft.mailing_address),
        is_rental: draft.is_rental,
        source_email: normalizeText(draft.source_email),
        notes: normalizeText(draft.notes),
        contacts,
        parking_permits: parkingPermits,
        automobiles,
      });
      toast.success('Homeowner changes saved');
    } catch (err) {
      const message = (err as Error).message;
      setSaveError(message);
      toast.error(message || 'Failed to save homeowner');
    }
  };

  const getPermitDocs = (permitId: number) => detail.parking_permits.find((permit) => permit.id === permitId)?.documents || [];

  const handlePermitFileChange = (permitId: number, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setPermitUploadFiles((prev) => ({ ...prev, [permitId]: file }));
  };

  const uploadPermitDocument = async (permitId: number) => {
    const uploadFile = permitUploadFiles[permitId];
    if (!uploadFile) return;

    setUploadingPermitId(permitId);
    try {
      const buffer = await uploadFile.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const contentBase64 = btoa(binary);

      await onUploadPermitDocument(permitId, {
        filename: uploadFile.name,
        document_title: normalizeText(permitUploadTitles[permitId] || '') || uploadFile.name,
        notes: normalizeText(permitUploadNotes[permitId] || ''),
        mime_type: uploadFile.type || 'application/octet-stream',
        content_base64: contentBase64,
      });

      setPermitUploadFiles((prev) => ({ ...prev, [permitId]: null }));
      setPermitUploadTitles((prev) => ({ ...prev, [permitId]: '' }));
      setPermitUploadNotes((prev) => ({ ...prev, [permitId]: '' }));
      toast.success(`Uploaded ${uploadFile.name}`);
    } catch (err) {
      toast.error((err as Error).message || 'Failed to upload permit document');
    } finally {
      setUploadingPermitId(null);
    }
  };

  const removePermitDocument = async (permitId: number, documentId: string) => {
    setRemovingDocumentId(documentId);
    try {
      await onRemovePermitDocument(permitId, documentId);
      toast.success('Permit document removed');
    } catch (err) {
      toast.error((err as Error).message || 'Failed to remove permit document');
    } finally {
      setRemovingDocumentId(null);
    }
  };

  const headerActionTarget = typeof document === 'undefined' ? null : document.getElementById('module-header-actions');
  const headerActions = (
    <div className="homeowner-header-actions">
      <button type="button" className="ghost-button" onClick={reset} disabled={!dirty || saving}>
        Reset
      </button>
      <button type="button" className="primary-button" onClick={() => void save()} disabled={!dirty || saving || validationErrors.length > 0}>
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );

  return (
    <>
      {headerActionTarget ? createPortal(headerActions, headerActionTarget) : null}
      <section className="panelish homeowners-detail-panel">
        <div className="detail-header-row">
          <div>
            <div className="eyebrow">Record detail</div>
            <h2>Unit {detail.unit_display || 'N/A'} · {detail.account_number}</h2>
          </div>
          <div className="chip-row">
            {dirty && <span className="chip chip-warning">Unsaved changes</span>}
            <span className={`chip ${draft.is_rental ? 'chip-rental' : ''}`}>{draft.is_rental ? 'Rental' : 'Owner occupied'}</span>
          </div>
        </div>

        <div className="detail-block form-block">
          <div className="detail-label">Read-only fields</div>
          <div className="form-grid two-up">
            <div>
              <div className="detail-label">Account number</div>
              <input value={detail.account_number} readOnly />
            </div>
            <div>
              <div className="detail-label">Unit</div>
              <input value={detail.unit_display} readOnly />
            </div>
          </div>
          <div>
            <div className="detail-label">Property address</div>
            <textarea value={detail.property_address || ''} readOnly rows={2} />
          </div>
        </div>

        <div className="detail-block form-block homeowner-section-card">
          <div className="detail-label">Editable fields</div>
          <label>
            <div className="detail-label">Mailing address</div>
            <textarea
              rows={2}
              value={draft.mailing_address}
              onChange={(event) => setDraft((prev) => (prev ? { ...prev, mailing_address: event.target.value } : prev))}
            />
          </label>
          <div className="form-grid two-up">
            <label>
              <div className="detail-label">Source email</div>
              <input
                value={draft.source_email}
                onChange={(event) => setDraft((prev) => (prev ? { ...prev, source_email: event.target.value } : prev))}
                aria-invalid={hasValue(draft.source_email) && !isValidEmail(draft.source_email)}
              />
            </label>
            <label className="homeowner-toggle">
              <input
                type="checkbox"
                checked={draft.is_rental}
                onChange={(event) => setDraft((prev) => (prev ? { ...prev, is_rental: event.target.checked } : prev))}
              />
              <span>Rental unit</span>
            </label>
          </div>
          <label>
            <div className="detail-label">Notes</div>
            <textarea
              rows={4}
              value={draft.notes}
              onChange={(event) => setDraft((prev) => (prev ? { ...prev, notes: event.target.value } : prev))}
            />
          </label>
        </div>

        <div className="detail-block form-block homeowner-section-card">
          <div className="detail-header-row">
            <div className="detail-label">Contacts / Homeowners ({draft.contacts.length})</div>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setDraft((prev) => (prev ? { ...prev, contacts: [...prev.contacts, emptyContact()] } : prev))}
            >
              + Add contact
            </button>
          </div>
          {draft.contacts.length ? (
            <div className="homeowner-sublist">
              {draft.contacts.map((contact, index) => (
                <div className="homeowner-sub-card" key={`contact-${index}`}>
                  <div className="homeowner-sub-title">Contact {index + 1}</div>
                  <div className="form-grid two-up">
                    <label>
                      <div className="detail-label">Name</div>
                      <input value={contact.name} onChange={(event) => updateContact(index, { name: event.target.value })} />
                    </label>
                    <label>
                      <div className="detail-label">Role</div>
                      <input value={contact.role} onChange={(event) => updateContact(index, { role: event.target.value })} />
                    </label>
                  </div>
                  <div className="form-grid two-up">
                    <label>
                      <div className="detail-label">Email</div>
                      <input
                        value={contact.email}
                        onChange={(event) => updateContact(index, { email: event.target.value })}
                        aria-invalid={hasValue(contact.email) && !isValidEmail(contact.email)}
                      />
                    </label>
                    <label>
                      <div className="detail-label">Phone</div>
                      <input value={contact.phone} onChange={(event) => updateContact(index, { phone: event.target.value })} />
                    </label>
                  </div>
                  <div className="homeowner-row-actions">
                    <label className="homeowner-toggle">
                      <input
                        type="checkbox"
                        checked={contact.is_board_member}
                        onChange={(event) => updateContact(index, { is_board_member: event.target.checked })}
                      />
                      <span>Board member</span>
                    </label>
                    <button
                      type="button"
                      className="ghost-button danger-ghost"
                      onClick={() => setDraft((prev) => (prev ? { ...prev, contacts: prev.contacts.filter((_, idx) => idx !== index) } : prev))}
                    >
                      Remove row
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-lane homeowner-empty-inline">
              No contacts yet.
              <button
                type="button"
                className="ghost-button"
                onClick={() => setDraft((prev) => (prev ? { ...prev, contacts: [...prev.contacts, emptyContact()] } : prev))}
              >
                Add first contact
              </button>
            </div>
          )}
        </div>

        <div className="detail-block form-block homeowner-section-card">
          <div className="detail-header-row">
            <div className="detail-label">Parking permits ({draft.parking_permits.length})</div>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setDraft((prev) => (prev ? { ...prev, parking_permits: [...prev.parking_permits, emptyPermit()] } : prev))}
            >
              + Add permit
            </button>
          </div>
          {draft.parking_permits.length ? (
            <div className="homeowner-sublist">
              {draft.parking_permits.map((permit, index) => {
                const docs = permit.id ? getPermitDocs(permit.id) : [];
                const uploadFile = permit.id ? permitUploadFiles[permit.id] : null;

                return (
                  <div className="homeowner-sub-card" key={permit.id ? `permit-${permit.id}` : `permit-new-${index}`}>
                    <div className="homeowner-sub-title">Permit {index + 1}</div>
                    <div className="form-grid two-up">
                      <label>
                        <div className="detail-label">Year</div>
                        <input
                          value={permit.year}
                          onChange={(event) => updatePermit(index, { year: event.target.value })}
                          aria-invalid={Boolean(permit.year.trim() && !/^\d{4}$/.test(permit.year.trim()))}
                        />
                      </label>
                      <label>
                        <div className="detail-label">Status</div>
                        <select value={permit.status} onChange={(event) => updatePermit(index, { status: event.target.value as PermitStatus })}>
                          {permitStatusOptions.map((option) => (
                            <option value={option} key={option}>{option}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label>
                      <div className="detail-label">Permit number</div>
                      <input
                        value={permit.permit_number}
                        onChange={(event) => updatePermit(index, { permit_number: event.target.value })}
                      />
                    </label>
                    <label>
                      <div className="detail-label">Permit note</div>
                      <textarea
                        rows={3}
                        value={permit.notes}
                        onChange={(event) => updatePermit(index, { notes: event.target.value })}
                      />
                    </label>

                    {permit.id ? (
                      <div className="permit-docs-wrap">
                        <div className="detail-label">Documents</div>
                        <div className="document-list">
                          {docs.length ? docs.map((doc) => (
                            <div className="document-card" key={doc.id}>
                              <div className="document-title">{doc.title}</div>
                              <div className="muted small-text document-meta-line">{doc.sharepoint_path || doc.source_type}</div>
                              {doc.notes && <div className="muted small-text document-meta-line">{doc.notes}</div>}
                              <div className="field-actions">
                                {doc.sharepoint_web_url ? (
                                  <a className="ghost-button document-action-link" href={doc.sharepoint_web_url} target="_blank" rel="noreferrer">Open</a>
                                ) : (
                                  <button className="ghost-button" type="button" disabled>No link</button>
                                )}
                                <button
                                  className="ghost-button danger-ghost"
                                  type="button"
                                  onClick={() => void removePermitDocument(permit.id as number, doc.id)}
                                  disabled={removingDocumentId === doc.id}
                                >
                                  {removingDocumentId === doc.id ? 'Removing…' : 'Remove'}
                                </button>
                              </div>
                            </div>
                          )) : <div className="empty-lane">No uploaded documents yet.</div>}
                        </div>

                        <div className="detail-label">Upload document</div>
                        <input type="file" onChange={(event) => handlePermitFileChange(permit.id as number, event)} />
                        {uploadFile && <div className="muted small-text">Selected file: {uploadFile.name}</div>}
                        <input
                          value={permitUploadTitles[permit.id] || ''}
                          onChange={(event) => setPermitUploadTitles((prev) => ({ ...prev, [permit.id as number]: event.target.value }))}
                          placeholder="Optional display title"
                        />
                        <textarea
                          value={permitUploadNotes[permit.id] || ''}
                          onChange={(event) => setPermitUploadNotes((prev) => ({ ...prev, [permit.id as number]: event.target.value }))}
                          rows={2}
                          placeholder="Upload notes"
                        />
                        <div className="field-actions">
                          <button
                            className="ghost-button"
                            type="button"
                            onClick={() => {
                              setPermitUploadFiles((prev) => ({ ...prev, [permit.id as number]: null }));
                              setPermitUploadTitles((prev) => ({ ...prev, [permit.id as number]: '' }));
                              setPermitUploadNotes((prev) => ({ ...prev, [permit.id as number]: '' }));
                            }}
                          >
                            Clear upload
                          </button>
                          <button
                            className="primary-button"
                            type="button"
                            onClick={() => void uploadPermitDocument(permit.id as number)}
                            disabled={uploadingPermitId === permit.id || !uploadFile}
                          >
                            {uploadingPermitId === permit.id ? 'Uploading…' : 'Upload document'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="muted small-text">Save homeowner changes first to attach permit documents.</div>
                    )}

                    <div className="homeowner-row-actions">
                      <div />
                      <button
                        type="button"
                        className="ghost-button danger-ghost"
                        onClick={() => setDraft((prev) => (prev ? { ...prev, parking_permits: prev.parking_permits.filter((_, idx) => idx !== index) } : prev))}
                      >
                        Remove row
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-lane homeowner-empty-inline">
              No parking permit records.
              <button
                type="button"
                className="ghost-button"
                onClick={() => setDraft((prev) => (prev ? { ...prev, parking_permits: [...prev.parking_permits, emptyPermit()] } : prev))}
              >
                Add first permit
              </button>
            </div>
          )}
        </div>

        <EditableAutomobilesSection
          automobiles={draft.automobiles}
          onChange={(automobiles) => setDraft((prev) => (prev ? { ...prev, automobiles } : prev))}
          disabled={saving}
        />

        {validationErrors.length > 0 && (
          <div className="error-banner">
            <div className="homeowner-validation-title">Validation issues</div>
            <ul className="homeowner-validation-list">
              {validationErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        )}

        {saveError && <div className="error-banner">{saveError}</div>}
      </section>
    </>
  );
}
