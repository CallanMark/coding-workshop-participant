/**
 * Incident history events as readable sentences.
 */
import { PRIORITIES, STATUSES } from '../../constants';

const label = (map, value) => map[value]?.label || value;

/**
 * One history event as a sentence, e.g. "Tina Tech moved it from Open to In progress".
 * @param {object} event - from GET /incidents/{id}/events (actor_name, from_name, to_name for ids).
 * @returns {string}
 */
export function describeEvent(event) {
  const who = event.actor_name || 'Someone';
  switch (event.event_type) {
    case 'created':
      return `${who} reported it`;
    case 'status_changed':
      return `${who} moved it from ${label(STATUSES, event.from_value)} to ${label(STATUSES, event.to_value)}`;
    case 'assigned':
      if (!event.to_value) return `${who} unassigned ${event.from_name || 'the engineer'}`;
      return event.actor_id === Number(event.to_value) ? `${who} took it` : `${who} assigned it to ${event.to_name}`;
    case 'escalated':
      return event.to_value === 'true' ? `${who} escalated it` : `${who} cleared the escalation`;
    case 'priority_changed':
      return `${who} changed priority from ${label(PRIORITIES, event.from_value)} to ${label(PRIORITIES, event.to_value)}`;
    case 'team_changed':
      return `${who} moved it to ${event.to_name || 'another team'}`;
    default:
      return `${who}: ${event.event_type}`;
  }
}
