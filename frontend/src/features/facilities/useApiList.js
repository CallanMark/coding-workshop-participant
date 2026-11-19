/**
 * Load a list from the API for a key (e.g. a building id), with loading, error and retry states.
 */
import { useEffect, useState } from 'react';

/**
 * @param {function(*): Promise<Array>} load - called with the key; must be a stable function (an API import).
 * @param {*} key - what to load for; null means nothing to load yet (e.g. no building chosen).
 * @returns {{status: 'idle'|'loading'|'ready'|'error', data: Array, error: string, retry: function(): void}}
 */
export default function useApiList(load, key) {
  const [result, setResult] = useState({ key: null, status: 'idle', data: [], error: '' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (key === null) return undefined;
    let ignore = false;
    load(key)
      .then((data) => { if (!ignore) setResult({ key, status: 'ready', data, error: '' }); })
      .catch((error) => { if (!ignore) setResult({ key, status: 'error', data: [], error: error.message }); });
    return () => {
      ignore = true;
    };
  }, [load, key, attempt]);

  const retry = () => {
    setResult((prev) => ({ ...prev, status: 'loading' }));
    setAttempt((n) => n + 1);
  };

  if (key === null) return { status: 'idle', data: [], error: '', retry };
  // An answer for an older key (the user picked another building) counts as still loading.
  if (result.key !== key) return { status: 'loading', data: [], error: '', retry };
  return { ...result, retry };
}
