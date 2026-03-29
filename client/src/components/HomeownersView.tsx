import { useState } from 'react';
import { HomeownerDetail, HomeownerSummary, HomeownerUpdatePayload } from '../types';
import { HomeownerEditor } from './homeowners/HomeownerEditor';
import { HomeownersDirectory } from './homeowners/HomeownersDirectory';

type HomeownersViewProps = {
  items: HomeownerSummary[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  detail: HomeownerDetail | null;
  listLoading: boolean;
  detailLoading: boolean;
  saving: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  onRefresh: () => Promise<void>;
  onSave: (id: number, payload: HomeownerUpdatePayload) => Promise<void>;
  onUploadPermitDocument: (permitId: number, payload: { filename: string; document_title?: string | null; notes?: string | null; mime_type?: string | null; content_base64: string }) => Promise<void>;
  onRemovePermitDocument: (permitId: number, documentId: string) => Promise<void>;
  error: string | null;
};

export function HomeownersView({
  items,
  selectedId,
  onSelect,
  detail,
  listLoading,
  detailLoading,
  saving,
  query,
  onQueryChange,
  onRefresh,
  onSave,
  onUploadPermitDocument,
  onRemovePermitDocument,
  error,
}: HomeownersViewProps) {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const handleSelect = (id: number) => {
    if (id === selectedId) return;
    if (hasUnsavedChanges) {
      const confirmed = window.confirm('You have unsaved edits. Switch records and discard those changes?');
      if (!confirmed) return;
    }
    onSelect(id);
  };

  return (
    <div className="homeowners-shell">
      <HomeownersDirectory
        items={items}
        selectedId={selectedId}
        onSelect={handleSelect}
        listLoading={listLoading}
        query={query}
        onQueryChange={onQueryChange}
        onRefresh={onRefresh}
        error={error}
      />
      <HomeownerEditor
        detail={detail}
        detailLoading={detailLoading}
        saving={saving}
        onSave={onSave}
        onDirtyChange={setHasUnsavedChanges}
        onUploadPermitDocument={onUploadPermitDocument}
        onRemovePermitDocument={onRemovePermitDocument}
      />
    </div>
  );
}
