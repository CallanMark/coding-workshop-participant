import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { changeIncidentStatus, createIncident, listIncidents } from '../../src/api/incidents';

/** The path and parsed body of the one fetch call made. */
function sent(fetchMock) {
  const [url, options] = fetchMock.mock.calls[0];
  return { path: url.replace(/^.*\/api/, ''), method: options.method, body: options.body && JSON.parse(options.body) };
}

describe('incidents API', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    vi.stubGlobal('fetch', fetchMock);
  });

  it('lists the role-scoped incidents by default', async () => {
    await listIncidents();
    expect(sent(fetchMock).path).toBe('/incidents');
  });

  it('asks for only my incidents with mine', async () => {
    await listIncidents({ mine: true });
    expect(sent(fetchMock).path).toBe('/incidents?mine=true');
  });

  it('changes status without saying who the user is (the server uses the token)', async () => {
    await changeIncidentStatus(12, { status: 'blocked', reason: 'Waiting for parts' });
    expect(sent(fetchMock)).toEqual({
      path: '/incidents/12/status', method: 'POST', body: { status: 'blocked', reason: 'Waiting for parts' },
    });
  });

  it('creates an incident with only what the form provides', async () => {
    await createIncident({ title: 'Leak', category_id: 1, building_id: 1 });
    expect(sent(fetchMock).body).toEqual({ title: 'Leak', category_id: 1, building_id: 1 });
  });
});
