import { DraftItem } from './types';

export const statusLabel: Record<string, string> = {
  pending_info: 'Pending info',
  todo: 'To-do',
  ready: 'Ready',
  scheduled: 'Scheduled',
  follow_up: 'Follow-up',
  completed: 'Completed',
  backlog: 'Backlog',
};

export const meetingIntentLabel: Record<string, string> = {
  next_meeting: 'Next meeting',
  next_meeting_if_ready: 'Next if ready',
  future: 'Future meeting',
  unscheduled: 'Unscheduled',
};

export const statusOptions = ['pending_info', 'todo', 'ready', 'scheduled', 'follow_up', 'completed', 'backlog'];

export const kindOptions = [
  { value: 'agenda_candidate', label: 'Agenda candidate' },
  { value: 'task', label: 'Board to-do' },
];

export const meetingIntentOptions = ['next_meeting', 'next_meeting_if_ready', 'future', 'unscheduled'];

export const priorityOptions = ['high', 'medium', 'low'];

export const emptyDraft: DraftItem = {
  title: '',
  description: '',
  category: '',
  priority: 'medium',
  kind: 'task',
  status: 'todo',
  meeting_intent: 'unscheduled',
  target_meeting_id: '',
  owner: '',
  decision_needed: '',
  next_action: '',
  notesText: '',
};
