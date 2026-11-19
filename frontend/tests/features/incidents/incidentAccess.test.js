import { describe, expect, it } from 'vitest';
import { allowedActions, relations } from '../../../src/features/incidents/incidentAccess';
import { describeEvent, eventColor, formatWhen } from '../../../src/features/incidents/eventText';

// Same people as the backend seed. Team 1 = Facilities.
const ADMIN = { id: 1, role: 'admin', team_id: null };
const EVE = { id: 2, role: 'employee', team_id: null };
const SAM = { id: 3, role: 'employee', team_id: null };
const FRED = { id: 4, role: 'engineer', team_id: 1 };
const TEAMMATE = { id: 9, role: 'engineer', team_id: 1 };
const TINA = { id: 5, role: 'engineer', team_id: 2 };
const PAT = { id: 8, role: 'manager', team_id: 1 };

const incident = (fields = {}) => ({
  id: 10, status: 'open', team_id: 1, reporter_id: 2, assignee_id: 4, is_escalated: false, ...fields,
});

describe('relations (mirror of the backend)', () => {
  it('names every way a user relates to an incident', () => {
    expect([...relations(ADMIN, incident())]).toEqual(['admin']);
    expect([...relations(PAT, incident())]).toEqual(['team', 'manager']);
    expect([...relations(FRED, incident())]).toEqual(['team', 'assignee']);
    expect([...relations(EVE, incident())]).toEqual(['reporter']);
    expect([...relations(TINA, incident())]).toEqual([]);
    expect([...relations(SAM, incident())]).toEqual([]);
  });
});

describe('allowed actions', () => {
  it('the assignee works the incident', () => {
    expect(allowedActions(FRED, incident()).moves).toEqual(['in_progress']);
    expect(allowedActions(FRED, incident({ status: 'in_progress' })).moves).toEqual(['blocked', 'resolved']);
  });

  it('the reporter can cancel while open and close or reopen once resolved', () => {
    expect(allowedActions(EVE, incident()).moves).toEqual(['closed']);
    expect(allowedActions(EVE, incident({ status: 'resolved' })).moves).toEqual(['closed', 'in_progress']);
  });

  it('nobody can start unassigned work', () => {
    expect(allowedActions(PAT, incident({ assignee_id: null })).moves).toEqual(['closed']);
  });

  it('a teammate can take an unassigned ticket but not move or assign it', () => {
    const can = allowedActions(TEAMMATE, incident({ assignee_id: null }));
    expect(can).toMatchObject({ moves: [], take: true, assign: false, edit: false });
    expect(allowedActions(TEAMMATE, incident()).take).toBe(false); // already assigned
  });

  it('the team manager and admin assign, edit and clear escalations; only admin deletes', () => {
    const escalated = incident({ is_escalated: true });
    expect(allowedActions(PAT, escalated)).toMatchObject({ assign: true, edit: true, clearEscalation: true, remove: false });
    expect(allowedActions(ADMIN, escalated)).toMatchObject({ assign: true, clearEscalation: true, remove: true });
  });

  it('the reporter edits only while open and can escalate but not clear', () => {
    expect(allowedActions(EVE, incident()).edit).toBe(true);
    expect(allowedActions(EVE, incident({ status: 'in_progress' })).edit).toBe(false);
    expect(allowedActions(EVE, incident()).escalate).toBe(true);
    expect(allowedActions(EVE, incident({ is_escalated: true })).clearEscalation).toBe(false);
  });

  it('a closed incident only offers delete to admin', () => {
    const closed = incident({ status: 'closed' });
    expect(allowedActions(ADMIN, closed)).toEqual({
      moves: [], take: false, assign: false, escalate: false, clearEscalation: false, edit: false, remove: true, note: false,
    });
  });
});

describe('history sentences', () => {
  const event = (fields) => ({ actor_id: 1, actor_name: 'Alex Admin', ...fields });
  it.each([
    [{ event_type: 'created' }, 'Alex Admin reported it'],
    [{ event_type: 'status_changed', from_value: 'open', to_value: 'in_progress' }, 'Alex Admin moved it from Open to In progress'],
    [{ event_type: 'assigned', from_value: null, to_value: '5', to_name: 'Tina Tech' }, 'Alex Admin assigned it to Tina Tech'],
    [{ event_type: 'assigned', from_value: null, to_value: '1' }, 'Alex Admin took it'],
    [{ event_type: 'assigned', from_value: '5', to_value: null, from_name: 'Tina Tech' }, 'Alex Admin unassigned Tina Tech'],
    [{ event_type: 'escalated', to_value: 'true' }, 'Alex Admin escalated it'],
    [{ event_type: 'escalated', to_value: 'false' }, 'Alex Admin cleared the escalation'],
    [{ event_type: 'priority_changed', from_value: 'low', to_value: 'high' }, 'Alex Admin changed priority from Low to High'],
    [{ event_type: 'team_changed', to_name: 'Workplace Technology' }, 'Alex Admin moved it to Workplace Technology'],
  ])('%o', (fields, sentence) => {
    expect(describeEvent(event(fields))).toBe(sentence);
  });
});

describe('timeline times and colours', () => {
  it('shows 24h time and weekday, then day/month', () => {
    expect(formatWhen('2026-10-19T14:05:00')).toEqual({ when: '14:05 Monday', date: '19/10' });
  });

  it('colours a status change by the new status', () => {
    expect(eventColor({ event_type: 'status_changed', to_value: 'blocked' })).toBe('error');
    expect(eventColor({ event_type: 'status_changed', to_value: 'closed' })).toBe('grey');
    expect(eventColor({ event_type: 'escalated', to_value: 'false' })).toBe('success');
  });
});
