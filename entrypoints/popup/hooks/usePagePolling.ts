import { useEffect, useRef } from 'react';

/**
 * Run a refresh immediately while enabled, then poll at a fixed cadence.
 * A callback ref prevents stateful parent closures from restarting the timer
 * on every render; disabling the page always clears the interval.
 */
export function usePagePolling(
  enabled: boolean,
  callback: () => void | Promise<unknown>,
  intervalMs: number,
): void {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;
    void callbackRef.current();
    const timer = window.setInterval(() => { void callbackRef.current(); }, intervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, intervalMs]);
}
