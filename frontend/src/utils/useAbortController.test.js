import React from 'react';
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

  it('aborts the controller when the component unmounts', () => {
    let captured;
    const Comp = () => {
      captured = useAbortController();
      return null;
    };
    const { unmount } = render(<Comp />);
    expect(captured.signal.aborted).toBe(false);
    unmount();
    expect(captured.signal.aborted).toBe(true);
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

  it('abort listeners on the signal fire on unmount', () => {
    let captured;
    const Comp = () => {
      captured = useAbortController();
      return null;
    };
    const { unmount } = render(<Comp />);
    let abortCount = 0;
    captured.signal.addEventListener('abort', () => abortCount++);
    unmount();
    expect(abortCount).toBe(1);
  });
});