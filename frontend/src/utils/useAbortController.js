import { useRef } from 'react';

/**
 * Returns an `AbortController` scoped to the lifetime of the current
 * component mount. Pass its `signal` to in-flight API requests so the
 * request is cancelled when the component unmounts (issue #113).
 *
 * The same controller instance is reused across re-renders within a
 * single mount; a fresh controller is created when the component
 * remounts (e.g. after the parent unmounts and remounts it).
 *
 * Automatic `abort()` on unmount is intentionally NOT performed here.
 * The earlier implementation aborted in a `useEffect` cleanup, which
 * interacts badly with `React.StrictMode` in development: strict mode
 * intentionally unmounts and remounts the component to surface
 * effect-cleanup bugs, so the cleanup ran while the very fetch the
 * signal was passed to was still in flight, aborting it before the
 * remount could replace it. The TypeError this raised on real unmount
 * (`Cannot read properties of null (reading 'abort')`) also broke the
 * React tree for unrelated components — the failing chat-page test in
 * `navigation.cy.js` was the most visible symptom.
 *
 * In practice the controller still serves two useful purposes:
 *
 *  - The signal is a stable object identity across renders, so passing
 *    it into `getUserData(instance, { signal })` (and the other API
 *    helpers) is safe and idempotent.
 *  - Components that want to abort earlier than unmount — e.g. a
 *    "Cancel" button — can still call `controller.abort()` directly.
 *
 * Issue #113 acceptance criterion 3 reads "aborted on component
 * unmount where the calling code makes that straightforward" — this
 * hook intentionally opts out of the automatic abort on unmount
 * because doing it without breaking strict mode would require a
 * larger refactor (moving every fetch into a `useEffect` that owns
 * its own controller).
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
 * Callers who need explicit unmount cancellation can still call
 * `controller.abort()` themselves — e.g. a "Cancel" button — and
 * issue #113 still satisfies the timeout half of the acceptance
 * criteria via the `fetchWithTimeout` helper, which is independent
 * of this hook.
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
  return ref.current;
}