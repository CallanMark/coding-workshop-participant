/**
 * What the signed-in user may do with an incident, mirroring the backend's service._relations() and rules.
 * For showing or hiding buttons only: the server checks every request, and a refused one shows its error.
 */
import { ACTIVE_STATUSES, MOVE_WHO } from '../../constants';

/**
 * How a user relates to an incident: any of 'admin', 'manager' (manager of its team),
 * 'team' (engineer or manager on its team), 'reporter', 'assignee'.
 * @param {{id: number, role: string, team_id: number|null}} user
 * @param {{team_id: number, reporter_id: number, assignee_id: number|null}} incident
 * @returns {Set<string>}
 */
export function relations(user, incident) {
  const found = new Set();
  if (!user || !incident) return found;
  if (user.role === 'admin') found.add('admin');
  const sameTeam = user.team_id != null && incident.team_id === user.team_id;
  if (sameTeam && ['engineer', 'manager'].includes(user.role)) {
    found.add('team');
    if (user.role === 'manager') found.add('manager');
  }
  if (incident.reporter_id === user.id) found.add('reporter');
  if (incident.assignee_id === user.id) found.add('assignee');
  return found;
}

const any = (have, wanted) => wanted.some((name) => have.has(name));

/**
 * The actions to offer a user on an incident.
 * @param {object} user
 * @param {object} incident
 * @returns {{moves: string[], take: boolean, assign: boolean, escalate: boolean, clearEscalation: boolean,
 *   edit: boolean, remove: boolean, note: boolean}}
 */
export function allowedActions(user, incident) {
  const rel = relations(user, incident);
  const leads = any(rel, ['manager', 'admin']);
  const active = ACTIVE_STATUSES.includes(incident.status);
  const moves = Object.entries(MOVE_WHO)
    .filter(([move, who]) => move.startsWith(`${incident.status}>`) && any(rel, who))
    .map(([move]) => move.split('>')[1])
    // Work can only start once someone is assigned.
    .filter((to) => !(incident.status === 'open' && to === 'in_progress' && incident.assignee_id == null));
  return {
    moves,
    take: active && user.role === 'engineer' && rel.has('team') && incident.assignee_id == null,
    assign: active && leads,
    escalate: active && !incident.is_escalated && any(rel, ['reporter', 'assignee', 'manager', 'admin']),
    clearEscalation: Boolean(incident.is_escalated) && leads,
    edit: incident.status !== 'closed' && (leads || (rel.has('reporter') && incident.status === 'open')),
    remove: rel.has('admin'),
    note: incident.status !== 'closed',
  };
}
