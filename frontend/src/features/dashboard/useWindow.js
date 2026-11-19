/**
 * The dashboard time window, kept in the URL as ?days= so a reload or shared link keeps it.
 */
import { useSearchParams } from 'react-router-dom';

export const WINDOWS = ['7', '30', '90'];
const DEFAULT_WINDOW = '30';

/**
 * The ?days= window from the URL (7, 30 or 90; 30 if missing or anything else) and a setter that keeps
 * the other query params.
 * @returns {[string, function(string): void]}
 */
export default function useWindow() {
  const [params, setParams] = useSearchParams();
  const days = WINDOWS.includes(params.get('days')) ? params.get('days') : DEFAULT_WINDOW;
  const setDays = (value) => {
    const next = new URLSearchParams(params);
    next.set('days', value);
    setParams(next, { replace: true });
  };
  return [days, setDays];
}
