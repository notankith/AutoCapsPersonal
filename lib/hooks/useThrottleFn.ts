import { useCallback, useEffect, useRef } from "react";

// Simple requestAnimationFrame-aware throttle hook
export function useThrottleFn<T extends (...args: any[]) => void>(fn: T | undefined, wait = 16) {
  const fnRef = useRef(fn);
  const frameRef = useRef<number | null>(null);
  const lastCallTimeRef = useRef(0);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const clearFrame = () => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  };

  useEffect(() => () => clearFrame(), []);

  return useCallback(
    (...args: Parameters<T>) => {
      if (!fnRef.current) return;
      const now = performance.now();
      const timeSinceLastCall = now - lastCallTimeRef.current;

      if (timeSinceLastCall >= wait) {
        lastCallTimeRef.current = now;
        fnRef.current(...args);
        return;
      }

      clearFrame();
      frameRef.current = requestAnimationFrame(() => {
        lastCallTimeRef.current = performance.now();
        fnRef.current?.(...args);
        frameRef.current = null;
      });
    },
    [wait]
  );
}
