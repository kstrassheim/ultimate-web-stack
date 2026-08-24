import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useAbortController } from './useAbortController';

describe('useAbortController', () => {
  it('returns an AbortController and keeps it across re-renders within a mount', () => {
    const seen = [];
    const Comp = () => {
      const controller = useAbortController();
      seen.push(controller);
      return null;
    };
    const { rerender } = render(<Comp />);
    rerender(<Comp />);
    rerender(<Comp />);
    expect(seen.length).toBeGreaterThanOrEqual(3);
    seen.forEach((c) => {
      expect(c).toBeInstanceOf(AbortController);
      expect(c).toBe(seen[0]);
    });
  });

  it('does not abort during a re-render in the same mount', () => {
    let captured;
    const Comp = () => {
      captured = useAbortController();
      return null;
    };
    const { rerender } = render(<Comp />);
    expect(captured.signal.aborted).toBe(false);
    rerender(<Comp />);
    expect(captured.signal.aborted).toBe(false);
  });

  it('does NOT auto-abort on unmount (intentional - see hook docstring)', () => {
    // The hook deliberately drops the useEffect-driven auto-abort on
    // unmount because doing it without breaking React.StrictMode would
    // require moving every fetch into a useEffect that owns its own
    // controller. The component's in-flight fetches are simply allowed
    // to complete naturally on unmount; setState on the unmounted
    // component is a no-op in React 18+.
    let captured;
    const Comp = () => {
      captured = useAbortController();
      return null;
    };
    const { unmount } = render(<Comp />);
    expect(captured.signal.aborted).toBe(false);
    unmount();
    expect(captured.signal.aborted).toBe(false);
  });

  it('creates a fresh controller when the component remounts', () => {
    let first;
    let second;
    const First = () => {
      first = useAbortController();
      return null;
    };
    const Second = () => {
      second = useAbortController();
      return null;
    };
    const { unmount } = render(<First />);
    unmount();
    render(<Second />);
    expect(first).toBeInstanceOf(AbortController);
    expect(second).toBeInstanceOf(AbortController);
    expect(second).not.toBe(first);
    expect(second.signal.aborted).toBe(false);
  });

  it('exposes a controller whose manual abort() still works', () => {
    // The hook still returns an AbortController, so callers that want
    // to abort early (e.g. a Cancel button) can do so explicitly.
    let captured;
    const Comp = () => {
      captured = useAbortController();
      return null;
    };
    const { unmount } = render(<Comp />);
    let abortCount = 0;
    captured.signal.addEventListener('abort', () => abortCount++);
    captured.abort();
    expect(abortCount).toBe(1);
    expect(captured.signal.aborted).toBe(true);
    unmount();
    // The unmount cleanup must not throw "Cannot read properties of
    // null (reading 'abort')" - the previous implementation could
    // null out `ref.current` between the simulated-unmount and the
    // real-unmount cleanups under React.StrictMode and crash the
    // whole subtree on the next unmount.
    expect(abortCount).toBe(1);
  });
});