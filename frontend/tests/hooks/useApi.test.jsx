import { act, renderHook, waitFor } from '@testing-library/react';
import {
  describe, expect, it, vi,
} from 'vitest';
import { ApiError } from '../../src/api/client';
import useApi from '../../src/hooks/useApi';

describe('useApi', () => {
  it('loads for the key and reports ready', async () => {
    const load = vi.fn(async (key) => ({ id: key }));
    const { result } = renderHook(() => useApi(load, 7));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.data).toEqual({ id: 7 });
    expect(load).toHaveBeenCalledWith(7);
  });

  it('waits while the key is null', () => {
    const load = vi.fn();
    const { result } = renderHook(() => useApi(load, null));
    expect(result.current.status).toBe('idle');
    expect(load).not.toHaveBeenCalled();
  });

  it('keeps the error message and status, so a 404 can show "not found"', async () => {
    const load = vi.fn(async () => { throw new ApiError('Incident not found', 404); });
    const { result } = renderHook(() => useApi(load, 1));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current).toMatchObject({ error: 'Incident not found', errorStatus: 404 });
  });

  it('reloads quietly, keeping the data on screen until the new answer arrives', async () => {
    let answer = 'first';
    const load = vi.fn(async () => answer);
    const { result } = renderHook(() => useApi(load, 'k'));
    await waitFor(() => expect(result.current.data).toBe('first'));
    answer = 'second';
    act(() => result.current.reload());
    expect(result.current).toMatchObject({ status: 'ready', data: 'first' }); // no spinner
    await waitFor(() => expect(result.current.data).toBe('second'));
  });

  it('retry shows loading again', async () => {
    const load = vi.fn(async () => { throw new ApiError('Down', 503); });
    const { result } = renderHook(() => useApi(load, 'k'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    act(() => result.current.retry());
    expect(result.current.status).toBe('loading');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('setData changes the loaded data in place (e.g. moving a card before the server answers)', async () => {
    const load = vi.fn(async () => [{ id: 1, status: 'open' }]);
    const { result } = renderHook(() => useApi(load, 'k'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.setData((rows) => rows.map((r) => ({ ...r, status: 'in_progress' }))));
    expect(result.current.data).toEqual([{ id: 1, status: 'in_progress' }]);
  });
});
