/**
 * Shared display mappings. The one place that decides status/priority labels and colours.
 */

/** Incident status → label and MUI Chip colour. */
export const STATUSES = {
  open: { label: 'Open', color: 'info' },
  in_progress: { label: 'In progress', color: 'primary' },
  blocked: { label: 'Blocked', color: 'error' },
  resolved: { label: 'Resolved', color: 'success' },
  closed: { label: 'Closed', color: 'default' },
};

/**
 * Allowed next statuses, used only to highlight drop targets on the board.
 * The backend TRANSITIONS dict is the real rule (including who may move it).
 */
export const NEXT_STATUSES = {
  open: ['in_progress', 'closed'],
  in_progress: ['blocked', 'resolved'],
  blocked: ['in_progress'],
  resolved: ['closed', 'in_progress'],
  closed: [],
};

/** Moves that need a reason ("from>to"); mirrors the backend. */
export const REASON_REQUIRED = new Set(['in_progress>blocked', 'resolved>in_progress', 'open>closed']);

/** Incident priority → label and MUI Chip colour. */
export const PRIORITIES = {
  low: { label: 'Low', color: 'default' },
  medium: { label: 'Medium', color: 'info' },
  high: { label: 'High', color: 'warning' },
  critical: { label: 'Critical', color: 'error' },
};
