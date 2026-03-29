import { FormEvent, useEffect, useMemo, useState } from 'react';
import { emptyDraft } from './constants';
import { DesktopAgendaShell, MobileAgendaShell } from './components/AgendaShell';
import { BoardMembersView } from './components/BoardMembersView';
import { HomeownersView } from './components/HomeownersView';
import { ParkingPermitsView } from './components/ParkingPermitsView';
import {
  AgendaGroups,
  AgendaItem,
  BoardMember,
  DraftItem,
  HomeownerDetail,
  HomeownerSummary,
  HomeownerUpdatePayload,
  Meeting,
  MobileTab,
  ParkingPermitDetail,
  ParkingPermitSummary,
  PermitStatus,
} from './types';

function App() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [removingDocumentId, setRemovingDocumentId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>('board');
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftItem>(emptyDraft);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');

  const [activeModule, setActiveModule] = useState<'agenda' | 'homeowners' | 'parking-permits' | 'board-members'>('agenda');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [homeowners, setHomeowners] = useState<HomeownerSummary[]>([]);
  const [homeownerQuery, setHomeownerQuery] = useState('');
  const [homeownersLoading, setHomeownersLoading] = useState(false);
  const [homeownersDetailLoading, setHomeownersDetailLoading] = useState(false);
  const [homeownersSaving, setHomeownersSaving] = useState(false);
  const [homeownersError, setHomeownersError] = useState<string | null>(null);
  const [selectedHomeownerId, setSelectedHomeownerId] = useState<number | null>(null);
  const [selectedHomeowner, setSelectedHomeowner] = useState<HomeownerDetail | null>(null);
  const [boardMembers, setBoardMembers] = useState<BoardMember[]>([]);
  const [boardMembersLoading, setBoardMembersLoading] = useState(false);
  const [boardMembersError, setBoardMembersError] = useState<string | null>(null);
  const [parkingPermits, setParkingPermits] = useState<ParkingPermitSummary[]>([]);
  const [parkingPermitYears, setParkingPermitYears] = useState<string[]>([]);
  const [selectedPermitYear, setSelectedPermitYear] = useState('');
  const [parkingPermitsLoading, setParkingPermitsLoading] = useState(false);
  const [parkingPermitDetailLoading, setParkingPermitDetailLoading] = useState(false);
  const [parkingPermitSaving, setParkingPermitSaving] = useState(false);
  const [parkingPermitDeleting, setParkingPermitDeleting] = useState(false);
  const [parkingPermitsError, setParkingPermitsError] = useState<string | null>(null);
  const [selectedParkingPermitId, setSelectedParkingPermitId] = useState<number | null>(null);
  const [selectedParkingPermit, setSelectedParkingPermit] = useState<ParkingPermitDetail | null>(null);

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

  const loadHomeowners = async (query = homeownerQuery) => {
    try {
      setHomeownersLoading(true);
      setHomeownersError(null);
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      const url = params.toString() ? `${apiBase}/homeowners?${params.toString()}` : `${apiBase}/homeowners`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load homeowners');
      const data = (await res.json()) as HomeownerSummary[];
      setHomeowners(data);
      setSelectedHomeownerId((prev) => {
        if (!data.length) return null;
        if (prev && data.some((row) => row.id === prev)) return prev;
        return data[0].id;
      });
    } catch (err) {
      setHomeownersError((err as Error).message);
    } finally {
      setHomeownersLoading(false);
    }
  };

  const refreshHomeownerDetail = async (homeownerId: number) => {
    const res = await fetch(`${apiBase}/homeowners/${homeownerId}`);
    if (!res.ok) throw new Error('Failed to load homeowner details');
    const detail = (await res.json()) as HomeownerDetail;
    setSelectedHomeowner(detail);
    return detail;
  };

  const saveHomeowner = async (homeownerId: number, payload: HomeownerUpdatePayload) => {
    setHomeownersSaving(true);
    setHomeownersError(null);
    try {
      const res = await fetch(`${apiBase}/homeowners/${homeownerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update homeowner');

      const updated = data as HomeownerDetail;
      setSelectedHomeowner(updated);
      setHomeowners((prev) => prev.map((row) => (
        row.id === updated.id
          ? {
            ...row,
            mailing_address: updated.mailing_address,
            is_rental: updated.is_rental,
            source_email: updated.source_email,
            notes: updated.notes,
            contact_count: updated.contacts.length,
            permit_count: updated.parking_permits.length,
            automobile_count: updated.automobiles.length,
            updated_at: updated.updated_at,
          }
          : row
      )));
      void loadBoardMembers();
    } catch (err) {
      setHomeownersError((err as Error).message);
      throw err;
    } finally {
      setHomeownersSaving(false);
    }
  };

  const loadBoardMembers = async () => {
    try {
      setBoardMembersLoading(true);
      setBoardMembersError(null);
      const res = await fetch(`${apiBase}/board-members`);
      if (!res.ok) throw new Error('Failed to load board members');
      const data = (await res.json()) as BoardMember[];
      setBoardMembers(data);
    } catch (err) {
      setBoardMembersError((err as Error).message);
    } finally {
      setBoardMembersLoading(false);
    }
  };

  const loadParkingPermitYears = async () => {
    const res = await fetch(`${apiBase}/parking-permits/years`);
    if (!res.ok) throw new Error('Failed to load permit years');
    const years = (await res.json()) as string[];
    setParkingPermitYears(years);
    return years;
  };

  const loadParkingPermits = async (year = selectedPermitYear) => {
    try {
      setParkingPermitsLoading(true);
      setParkingPermitsError(null);
      const params = new URLSearchParams();
      if (year.trim()) params.set('year', year.trim());
      const url = params.toString() ? `${apiBase}/parking-permits?${params.toString()}` : `${apiBase}/parking-permits`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load parking permits');
      const data = (await res.json()) as ParkingPermitSummary[];
      setParkingPermits(data);
      setSelectedParkingPermitId((prev) => {
        if (!data.length) return null;
        if (prev && data.some((row) => row.id === prev)) return prev;
        return data[0].id;
      });
    } catch (err) {
      setParkingPermitsError((err as Error).message);
    } finally {
      setParkingPermitsLoading(false);
    }
  };

  const refreshSelectedParkingPermit = async (permitId: number) => {
    const res = await fetch(`${apiBase}/parking-permits/${permitId}`);
    if (!res.ok) throw new Error('Failed to load permit details');
    const detail = (await res.json()) as ParkingPermitDetail;
    setSelectedParkingPermit(detail);
    return detail;
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!isDrawerOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDrawerOpen]);

  useEffect(() => {
    document.body.style.overflow = isDrawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isDrawerOpen]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadHomeowners(homeownerQuery);
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [homeownerQuery]);

  useEffect(() => {
    void loadBoardMembers();
  }, []);

  useEffect(() => {
    if (selectedHomeownerId == null) {
      setSelectedHomeowner(null);
      return;
    }
    let cancelled = false;
    const loadDetail = async () => {
      try {
        setHomeownersDetailLoading(true);
        const res = await fetch(`${apiBase}/homeowners/${selectedHomeownerId}`);
        if (!res.ok) throw new Error('Failed to load homeowner details');
        const detail = (await res.json()) as HomeownerDetail;
        if (!cancelled) setSelectedHomeowner(detail);
      } catch (err) {
        if (!cancelled) setHomeownersError((err as Error).message);
      } finally {
        if (!cancelled) setHomeownersDetailLoading(false);
      }
    };
    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [apiBase, selectedHomeownerId]);

  useEffect(() => {
    void loadParkingPermitYears().catch((err) => setParkingPermitsError((err as Error).message));
  }, []);

  useEffect(() => {
    void loadParkingPermits(selectedPermitYear);
  }, [selectedPermitYear]);

  useEffect(() => {
    if (selectedParkingPermitId == null) {
      setSelectedParkingPermit(null);
      return;
    }
    let cancelled = false;
    const loadDetail = async () => {
      try {
        setParkingPermitDetailLoading(true);
        const res = await fetch(`${apiBase}/parking-permits/${selectedParkingPermitId}`);
        if (!res.ok) throw new Error('Failed to load permit details');
        const detail = (await res.json()) as ParkingPermitDetail;
        if (!cancelled) setSelectedParkingPermit(detail);
      } catch (err) {
        if (!cancelled) setParkingPermitsError((err as Error).message);
      } finally {
        if (!cancelled) setParkingPermitDetailLoading(false);
      }
    };
    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedParkingPermitId]);

  const grouped: AgendaGroups = useMemo(() => ({
    nextMeeting: items.filter((item) => item.status !== 'completed' && (item.meeting_intent === 'next_meeting' || item.meeting_intent === 'next_meeting_if_ready')),
    todos: items.filter((item) => item.status !== 'completed' && item.kind === 'task' && item.meeting_intent !== 'future'),
    future: items.filter((item) => item.status !== 'completed' && item.meeting_intent === 'future'),
    completed: items.filter((item) => item.status === 'completed'),
  }), [items]);

  const selectedItem = items.find((item) => item.id === selectedItemId)
    ?? grouped.nextMeeting[0]
    ?? grouped.todos[0]
    ?? grouped.future[0]
    ?? grouped.completed[0]
    ?? null;

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

  useEffect(() => {
    if (!selectedItemId) return;
    void refreshSelectedItem(selectedItemId).catch(() => {
      // Non-fatal: keep list data visible even if detail hydration fails.
    });
  }, [selectedItemId]);

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
      const contentType = res.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await res.json() : { error: await res.text() };
      if (!res.ok) throw new Error(data.error || 'Failed to upload document');
      await refreshSelectedItem(selectedItem.id);
      setUploadFile(null);
      setUploadTitle('');
      setUploadNotes('');
      setNotice(`Uploaded ${uploadFile.name}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploadingDocument(false);
    }
  };

  const removeDocument = async (documentId: string) => {
    if (!selectedItem) return;
    setRemovingDocumentId(documentId);
    try {
      const res = await fetch(`${apiBase}/items/${selectedItem.id}/documents/${documentId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove document');
      await refreshSelectedItem(selectedItem.id);
      setNotice('Removed document from agenda item');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRemovingDocumentId(null);
    }
  };

  const createParkingPermit = async (payload: { homeowner_id: number; year?: string | null; status?: PermitStatus | null; permit_number?: string | null }) => {
    setParkingPermitsError(null);
    const res = await fetch(`${apiBase}/homeowners/${payload.homeowner_id}/parking-permits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        year: payload.year,
        status: payload.status || 'Pending',
        permit_number: payload.permit_number,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create permit');
    const created = data as ParkingPermitDetail;
    setSelectedParkingPermitId(created.id);
    await Promise.all([
      loadParkingPermits(selectedPermitYear),
      loadParkingPermitYears(),
      loadHomeowners(homeownerQuery),
    ]);
  };

  const saveParkingPermit = async (permitId: number, payload: { year?: string | null; status?: PermitStatus | null; permit_number?: string | null }) => {
    setParkingPermitSaving(true);
    setParkingPermitsError(null);
    try {
      const res = await fetch(`${apiBase}/parking-permits/${permitId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update permit');
      const updated = data as ParkingPermitDetail;
      setSelectedParkingPermit(updated);
      setParkingPermits((prev) => prev.map((permit) => (permit.id === updated.id
        ? {
          ...permit,
          year: updated.year,
          status: updated.status,
          permit_number: updated.permit_number,
          homeowner_names: updated.homeowner_names,
          updated_at: updated.updated_at,
          document_count: updated.documents.length,
        }
        : permit)));
      await Promise.all([
        loadParkingPermitYears(),
        loadHomeowners(homeownerQuery),
      ]);
    } catch (err) {
      setParkingPermitsError((err as Error).message);
      throw err;
    } finally {
      setParkingPermitSaving(false);
    }
  };

  const deleteParkingPermit = async (permitId: number) => {
    setParkingPermitDeleting(true);
    setParkingPermitsError(null);
    try {
      const res = await fetch(`${apiBase}/parking-permits/${permitId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete permit');
      setParkingPermits((prev) => {
        const next = prev.filter((permit) => permit.id !== permitId);
        setSelectedParkingPermitId(next.length ? next[0].id : null);
        return next;
      });
      await Promise.all([
        loadParkingPermitYears(),
        loadHomeowners(homeownerQuery),
      ]);
    } catch (err) {
      setParkingPermitsError((err as Error).message);
      throw err;
    } finally {
      setParkingPermitDeleting(false);
    }
  };

  const uploadPermitDocument = async (permitId: number, payload: { filename: string; document_title?: string | null; notes?: string | null; mime_type?: string | null; content_base64: string }) => {
    setParkingPermitsError(null);
    const res = await fetch(`${apiBase}/parking-permits/${permitId}/sharepoint/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await res.json() : { error: await res.text() };
    if (!res.ok) throw new Error(data.error || 'Failed to upload permit document');
    await loadParkingPermits(selectedPermitYear);
    if (selectedParkingPermitId != null) {
      await refreshSelectedParkingPermit(selectedParkingPermitId);
    }
    if (selectedHomeownerId != null) await refreshHomeownerDetail(selectedHomeownerId);
  };

  const removePermitDocument = async (permitId: number, documentId: string) => {
    setParkingPermitsError(null);
    const res = await fetch(`${apiBase}/parking-permits/${permitId}/documents/${documentId}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to remove permit document');
    await loadParkingPermits(selectedPermitYear);
    if (selectedParkingPermitId != null) {
      await refreshSelectedParkingPermit(selectedParkingPermitId);
    }
    if (selectedHomeownerId != null) await refreshHomeownerDetail(selectedHomeownerId);
  };

  const reorderItems = async (laneKey: keyof AgendaGroups, draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    const laneItems = [...grouped[laneKey]];
    const fromIndex = laneItems.findIndex((item) => item.id === draggedId);
    const toIndex = laneItems.findIndex((item) => item.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const [moved] = laneItems.splice(fromIndex, 1);
    laneItems.splice(toIndex, 0, moved);

    const laneIds = laneItems.map((item) => item.id);
    const nextMeetingIds = laneKey === 'nextMeeting' ? laneIds : grouped.nextMeeting.map((item) => item.id);
    const todoIds = laneKey === 'todos' ? laneIds : grouped.todos.map((item) => item.id);
    const futureIds = laneKey === 'future' ? laneIds : grouped.future.map((item) => item.id);
    const completedIds = laneKey === 'completed' ? laneIds : grouped.completed.map((item) => item.id);
    const orderedIds = [...nextMeetingIds, ...todoIds, ...futureIds, ...completedIds];

    const sortMap = new Map(orderedIds.map((id, index) => [id, index + 1]));
    setItems((prev) => [...prev]
      .sort((a, b) => (sortMap.get(a.id) || 999999) - (sortMap.get(b.id) || 999999))
      .map((item) => ({ ...item, sort_order: sortMap.get(item.id) || item.sort_order || 0 })));

    try {
      const res = await fetch(`${apiBase}/items/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: orderedIds }),
      });
      if (!res.ok) throw new Error('Failed to reorder items');
      setNotice(`Reordered ${laneKey}`);
    } catch (err) {
      setError((err as Error).message);
      await loadData();
    }
  };

  const handleSelectItem = (id: string) => {
    setSelectedItemId(id);
    setMobileTab('item');
  };

  const handleModuleChange = (module: 'agenda' | 'homeowners' | 'parking-permits' | 'board-members') => {
    setActiveModule(module);
    setIsDrawerOpen(false);
  };

  if (loading) return <div className="loading-screen">Loading HOA agenda app…</div>;
  if (error && !items.length) return <div className="loading-screen error">{error}</div>;

  return (
    <>
      <header className="app-header-wrap">
        <div className="app-header panelish">
          <button
            type="button"
            className="menu-button"
            aria-label="Open module menu"
            aria-expanded={isDrawerOpen}
            aria-controls="module-drawer"
            onClick={() => setIsDrawerOpen(true)}
          >
            <span />
            <span />
            <span />
          </button>
          <div className="app-header-title">
            <span className="eyebrow">Module</span>
            <h2>
              {activeModule === 'agenda'
                ? 'Agenda'
                : activeModule === 'homeowners'
                  ? 'Homeowners'
                  : activeModule === 'parking-permits'
                    ? 'Parking Permits'
                  : 'Board Members'}
            </h2>
          </div>
          <div id="module-header-actions" className="app-header-actions" />
        </div>
      </header>
      <div
        className={`drawer-backdrop ${isDrawerOpen ? 'open' : ''}`}
        onClick={() => setIsDrawerOpen(false)}
        aria-hidden={!isDrawerOpen}
      >
        <aside
          id="module-drawer"
          className={`module-drawer panelish ${isDrawerOpen ? 'open' : ''}`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="drawer-header">
            <span className="section-heading">Modules</span>
            <button
              type="button"
              className="drawer-close"
              aria-label="Close module menu"
              onClick={() => setIsDrawerOpen(false)}
            >
              Close
            </button>
          </div>
          <nav className="drawer-nav">
            <button
              type="button"
              className={`drawer-module-button ${activeModule === 'agenda' ? 'active' : ''}`}
              onClick={() => handleModuleChange('agenda')}
            >
              Agenda
            </button>
            <button
              type="button"
              className={`drawer-module-button ${activeModule === 'homeowners' ? 'active' : ''}`}
              onClick={() => handleModuleChange('homeowners')}
            >
              Homeowners
            </button>
            <button
              type="button"
              className={`drawer-module-button ${activeModule === 'board-members' ? 'active' : ''}`}
              onClick={() => handleModuleChange('board-members')}
            >
              Board Members
            </button>
            <button
              type="button"
              className={`drawer-module-button ${activeModule === 'parking-permits' ? 'active' : ''}`}
              onClick={() => handleModuleChange('parking-permits')}
            >
              Parking Permits
            </button>
          </nav>
        </aside>
      </div>

      {activeModule === 'agenda' && (
        <>
          <div className="desktop-only">
            <DesktopAgendaShell
              meetings={meetings}
              grouped={grouped}
              selectedItem={selectedItem}
              selectedItemId={selectedItemId}
              setSelectedItemId={setSelectedItemId}
              draggedItemId={draggedItemId}
              setDraggedItemId={setDraggedItemId}
              reorderItems={reorderItems}
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
            />
          </div>

          <div className="mobile-only">
            <MobileAgendaShell
              meetings={meetings}
              grouped={grouped}
              selectedItem={selectedItem}
              draggedItemId={draggedItemId}
              setDraggedItemId={setDraggedItemId}
              reorderItems={reorderItems}
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
              mobileTab={mobileTab}
              setMobileTab={setMobileTab}
              onSelectItem={handleSelectItem}
            />
          </div>
        </>
      )}

      {activeModule === 'homeowners' && (
        <main className="homeowners-page">
          <HomeownersView
            items={homeowners}
            selectedId={selectedHomeownerId}
            onSelect={setSelectedHomeownerId}
            detail={selectedHomeowner}
            listLoading={homeownersLoading}
            detailLoading={homeownersDetailLoading}
            saving={homeownersSaving}
            query={homeownerQuery}
            onQueryChange={setHomeownerQuery}
            onRefresh={() => loadHomeowners(homeownerQuery)}
            onSave={saveHomeowner}
            onUploadPermitDocument={uploadPermitDocument}
            onRemovePermitDocument={removePermitDocument}
            error={homeownersError}
          />
        </main>
      )}

      {activeModule === 'parking-permits' && (
        <main className="homeowners-page">
          <ParkingPermitsView
            permits={parkingPermits}
            selectedPermitId={selectedParkingPermitId}
            selectedPermit={selectedParkingPermit}
            loading={parkingPermitsLoading}
            detailLoading={parkingPermitDetailLoading}
            saving={parkingPermitSaving}
            deleting={parkingPermitDeleting}
            years={parkingPermitYears}
            selectedYear={selectedPermitYear}
            onYearChange={setSelectedPermitYear}
            homeowners={homeowners}
            onRefresh={() => loadParkingPermits(selectedPermitYear)}
            onSelectPermit={setSelectedParkingPermitId}
            onCreatePermit={createParkingPermit}
            onSavePermit={saveParkingPermit}
            onDeletePermit={deleteParkingPermit}
            onUploadPermitDocument={uploadPermitDocument}
            onRemovePermitDocument={removePermitDocument}
            error={parkingPermitsError}
          />
        </main>
      )}

      {activeModule === 'board-members' && (
        <main className="homeowners-page">
          <BoardMembersView
            members={boardMembers}
            loading={boardMembersLoading}
            error={boardMembersError}
            onRefresh={loadBoardMembers}
          />
        </main>
      )}
    </>
  );
}

export default App;
