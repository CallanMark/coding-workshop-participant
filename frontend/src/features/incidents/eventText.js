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

/**
 * A timeline timestamp: bold part (24h time and weekday) and the short date, in UK style.
 * @param {string} value - ISO timestamp.
 * @returns {{when: string, date: string}} e.g. { when: '14:05 Monday', date: '19/10' }
 */
export function formatWhen(value) {
  const at = new Date(value);
  const time = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const day = at.toLocaleDateString('en-GB', { weekday: 'long' });
  const date = at.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
  return { when: `${time} ${day}`, date };
}

/**
 * A date and time in the same UK style as the timeline, everywhere in the app.
 * @param {string} value - ISO timestamp.
 * @returns {string} e.g. "20 Nov 2026, 07:26"
 */
export function formatDateTime(value) {
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * The colour of an event's dot on the timeline (a theme palette name).
 * @param {object} event
 * @returns {string}
 */
export function eventColor(event) {
  switch (event.event_type) {
    case 'created': return 'info';
    case 'status_changed': return STATUSES[event.to_value]?.color === 'default' ? 'grey' : STATUSES[event.to_value]?.color || 'grey';
    case 'assigned': return 'primary';
    case 'escalated': return event.to_value === 'true' ? 'error' : 'success';
    case 'priority_changed': return 'warning';
    default: return 'secondary';
  }
}
