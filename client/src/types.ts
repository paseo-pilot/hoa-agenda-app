export type Meeting = {
  id: string;
  title: string;
  meeting_date: string;
  cadence_note?: string | null;
  status: string;
};

export type DocumentRecord = {
  id: string;
  title: string;
  source_type: string;
  sharepoint_item_id?: string | null;
  sharepoint_web_url?: string | null;
  sharepoint_path?: string | null;
  mime_type?: string | null;
  notes?: string | null;
  relation_type?: string | null;
  updated_at: string;
};

export type AgendaItem = {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  priority?: string | null;
  sort_order?: number;
  kind: string;
  status: string;
  meeting_intent?: string | null;
  target_meeting_id?: string | null;
  target_meeting_title?: string | null;
  owner?: string | null;
  decision_needed?: string | null;
  next_action?: string | null;
  notes: string[];
  documents?: DocumentRecord[];
  updated_at: string;
};

export type DraftItem = {
  title: string;
  description: string;
  category: string;
  priority: string;
  kind: string;
  status: string;
  meeting_intent: string;
  target_meeting_id: string;
  owner: string;
  decision_needed: string;
  next_action: string;
  notesText: string;
};

export type MobileTab = 'board' | 'item' | 'add';
export type LaneKey = 'nextMeeting' | 'todos' | 'future' | 'completed';

export type AgendaGroups = {
  nextMeeting: AgendaItem[];
  todos: AgendaItem[];
  future: AgendaItem[];
  completed: AgendaItem[];
};

export type HomeownerSummary = {
  id: number;
  account_number: string;
  unit_display: string;
  contact_names?: string[];
  property_address?: string | null;
  mailing_address?: string | null;
  is_rental: boolean;
  source_email?: string | null;
  notes?: string | null;
  source_file?: string | null;
  source_updated_at?: string | null;
  contact_count: number;
  permit_count: number;
  automobile_count: number;
  created_at: string;
  updated_at: string;
};

export type HomeownerContact = {
  id: number;
  sort_order: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  is_board_member: boolean;
};

export type HomeownerParkingPermit = {
  id: number;
  sort_order: number;
  year?: string | null;
  status: 'Pending' | 'Approved' | 'Denied';
  permit_number?: string | null;
  notes?: string | null;
  documents: DocumentRecord[];
};

export type HomeownerAutomobile = {
  id: number;
  sort_order: number;
  license_plate?: string | null;
  make?: string | null;
  model?: string | null;
  color?: string | null;
};

export type HomeownerDetail = HomeownerSummary & {
  contacts: HomeownerContact[];
  parking_permits: HomeownerParkingPermit[];
  automobiles: HomeownerAutomobile[];
};

export type HomeownerUpdateContact = {
  name: string;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  is_board_member: boolean;
};

export type HomeownerUpdateParkingPermit = {
  id?: number;
  year?: string | null;
  status?: 'Pending' | 'Approved' | 'Denied' | null;
  permit_number?: string | null;
  notes?: string | null;
};

export type HomeownerUpdateAutomobile = {
  license_plate?: string | null;
  make?: string | null;
  model?: string | null;
  color?: string | null;
};

export type HomeownerUpdatePayload = {
  mailing_address?: string | null;
  is_rental?: boolean;
  source_email?: string | null;
  notes?: string | null;
  contacts?: HomeownerUpdateContact[];
  parking_permits?: HomeownerUpdateParkingPermit[];
  automobiles?: HomeownerUpdateAutomobile[];
};

export type BoardMember = {
  contact_id: number;
  homeowner_id: number;
  account_number: string;
  unit_display: string;
  property_address?: string | null;
  sort_order: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
};

export type PermitStatus = 'Pending' | 'Approved' | 'Denied';

export type ParkingPermitSummary = {
  id: number;
  homeowner_id: number;
  sort_order: number;
  year?: string | null;
  status: PermitStatus;
  permit_number?: string | null;
  notes?: string | null;
  unit_display: string;
  account_number: string;
  homeowner_names: string[];
  document_count: number;
  created_at: string;
  updated_at: string;
};

export type ParkingPermitDetail = ParkingPermitSummary & {
  documents: DocumentRecord[];
  automobiles: HomeownerAutomobile[];
};
