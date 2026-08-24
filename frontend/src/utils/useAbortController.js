import { useEffect, useRef } from 'react';

/**
 * Returns an `AbortController` scoped to the lifetime of the current
 * component mount. Pass its `signal` to in-flight API requests so the
 * request is cancelled when the component unmounts (issue #113).
 *
 * The same controller instance is reused across re-renders within a
 * single mount; a fresh controller is created when the component
 * remounts (e.g. after the parent unmounts and remounts it).
 *
 * Usage:
 *
 *     const abortController = useAbortController();
 *
 *     useEffect(() => {
 *       let cancelled = false;
 *       (async () => {
 *         try {
 *           const data = await getAllExperiments(instance, { signal: abortController.signal });
 *           if (!cancelled) setData(data);
 *         } catch (err) {
 *           // The "AbortError" raised by `abort()` is the unmount path —
 *           // skip surfacing it as a user-visible error.
 *           if (err?.name !== 'AbortError') notyfService.error(err.message);
 *         }
 *       })();
 *     }, [instance]);
 *
 * The helper intentionally returns a controller (not just a signal)
 * so callers who want to abort earlier than unmount can call
 * `controller.abort()` themselves — e.g. a "Cancel" button.
 *
 * @returns {AbortController}
 */
export function useAbortController() {
  // `useRef(null)` + lazy creation in render keeps the controller stable
  // across re-renders within a single mount and lets us recreate it on
  // remount. Setting it via `useRef` rather than `useState` avoids a
  // re-render on creation and matches the "imperative handle" pattern
  // the React docs recommend for this kind of escape hatch.
  const ref = useRef(null);
  if (ref.current === null) {
    ref.current = new AbortController();
  }
  useEffect(() => {
    const controller = ref.current;
    return () => {
      // Abort on unmount so any in-flight fetch the controller was
      // passed to is cancelled. `?.abort()` is safe even if a caller
      // already aborted manually.
      controller.abort();
      ref.current = null;
    };
  }, []);
  return ref.current;
}