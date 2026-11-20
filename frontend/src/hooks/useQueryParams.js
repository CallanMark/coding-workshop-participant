/**
 * Read and change URL query values (filters, tabs, the chosen team) so a reload or shared link keeps them.
 */
import { useSearchParams } from 'react-router-dom';

/**
 * @returns {[URLSearchParams, function(Object<string, string|null|undefined>): void]} the current values, and
 *   update(changes): sets each key to its value, or removes it when the value is empty; other keys are kept.
 *   Replaces the history entry, so changing a filter doesn't add a Back step.
 */
export default function useQueryParams() {
  const [params, setParams] = useSearchParams();
  const update = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
    setParams(next, { replace: true });
  };
  return [params, update];
}
