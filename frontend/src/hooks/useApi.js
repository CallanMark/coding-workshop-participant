/**
 * Load data from the API for a key (a building id, an incident id, a dashboard and window, ...), with
 * loading, error and retry states. The one fetch pattern for every page: use it with <Loaded> to render.
 * `data` is [] until loaded, so lists can render straight away; check `status` before using an object.
 */
import { useEffect, useState } from 'react';

/**
 * @param {function(*): Promise<*>} load - called with the key; must be a stable function (an API import or a
 *   module-level helper), so it isn't re-created on every render.
 * @param {*} key - what to load for; it reloads whenever this changes. null means nothing to load yet.
 * @returns {{status: 'idle'|'loading'|'ready'|'error', data: *, error: string, errorStatus: number|null,
 *   retry: function(): void, reload: function(): void, setData: function(*): void}}
 *   retry shows the spinner while it reloads (after an error); reload refreshes quietly, keeping what's shown
 *   (after an action); setData changes the loaded data in place, e.g. to move a card before the server answers.
 */
export default function useApi(load, key) {
  const [result, setResult] = useState({ key: null, status: 'idle', data: [], error: '', errorStatus: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (key === null) return undefined;
    let ignore = false;
    load(key)
      .then((data) => {
        if (!ignore) setResult({ key, status: 'ready', data, error: '', errorStatus: null });
      })
      .catch((error) => {
        if (!ignore) setResult({ key, status: 'error', data: [], error: error.message, errorStatus: error.status ?? null });
      });
    return () => {
      ignore = true;
    };
  }, [load, key, attempt]);

  const reload = () => setAttempt((n) => n + 1);
  const retry = () => {
    setResult((prev) => ({ ...prev, status: 'loading' }));
    reload();
  };
  const setData = (update) => setResult((prev) => ({
    ...prev, data: typeof update === 'function' ? update(prev.data) : update,
  }));

  const actions = { retry, reload, setData };
  if (key === null) return { status: 'idle', data: [], error: '', errorStatus: null, ...actions };
  // An answer for an older key (the user picked another building) counts as still loading.
  if (result.key !== key) return { status: 'loading', data: [], error: '', errorStatus: null, ...actions };
  return { ...result, ...actions };
}
