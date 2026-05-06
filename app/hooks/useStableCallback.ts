import { useCallback, useLayoutEffect, useRef } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useStableCallback<T extends (...args: any[]) => any>(cb: T): T {
  const cbRef = useRef<T>(cb);

  useLayoutEffect(() => {
    cbRef.current = cb;
  }, [cb]);

  const wrappedCb = useCallback((...args: Parameters<T>) => {
    return cbRef.current(...args);
  }, []);

  return wrappedCb as T;
}
