import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { ApiError, apiRequest, setSessionExpiredHandler } from '../../src/api/client';
import { loadSession, saveSession } from '../../src/api/session';

/** A minimal fetch Response. */
function reply(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe('apiRequest', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    setSessionExpiredHandler(null);
  });

  it('sends the token when signed in', async () => {
    saveSession({ token: 'abc', user: { id: 1 } });
    fetchMock.mockResolvedValue(reply(200, []));

    await apiRequest('/incidents');

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/incidents$/);
    expect(options.headers.Authorization).toBe('Bearer abc');
  });

  it('sends no token when signed out', async () => {
    fetchMock.mockResolvedValue(reply(200, []));
    await apiRequest('/incidents');
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  });

  it("treats CloudFront's index.html answer to an API 404 as not found", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/html' }),
      json: async () => { throw new SyntaxError('Unexpected token <'); },
    });

    const error = await apiRequest('/incidents/999').catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(404);
  });

  it('returns a JSON null body as it is', async () => {
    fetchMock.mockResolvedValue({ ...reply(200, null), headers: new Headers({ 'content-type': 'application/json' }) });
    expect(await apiRequest('/incidents/1/feedback')).toBeNull();
  });

  it('turns error responses into ApiError with field details', async () => {
    fetchMock.mockResolvedValue(reply(400, { error: { message: 'Validation failed', details: { title: 'Required' } } }));

    const error = await apiRequest('/incidents', { method: 'POST', body: {} }).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.details).toEqual({ title: 'Required' });
  });

  it('signs out when a signed-in request gets a 401', async () => {
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    saveSession({ token: 'old', user: { id: 1 } });
    fetchMock.mockResolvedValue(reply(401, { error: { message: 'Your session has expired. Please sign in again.' } }));

    await expect(apiRequest('/auth/me')).rejects.toMatchObject({ status: 401 });

    expect(loadSession()).toBeNull();
    expect(onExpired).toHaveBeenCalledWith('Your session has expired. Please sign in again.');
  });

  it('does not sign out on a failed sign-in (401 without a token)', async () => {
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    fetchMock.mockResolvedValue(reply(401, { error: { message: 'Email or password is incorrect' } }));

    await expect(apiRequest('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 401 });

    expect(onExpired).not.toHaveBeenCalled();
  });

  it('reports network failures as status 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(apiRequest('/incidents')).rejects.toMatchObject({ status: 0, message: expect.stringMatching(/could not reach/i) });
  });
});
