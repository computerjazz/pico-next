import { useCallback, useLayoutEffect, useRef } from "react";

export function useStableCallback<T extends (...args: unknown[]) => unknown>(
  cb: T,
): T {
  const cbRef = useRef<T>(cb);

  useLayoutEffect(() => {
    cbRef.current = cb;
  }, [cb]);

  const wrappedCb = useCallback((...args: Parameters<T>) => {
    return cbRef.current(...args);
  }, []);

  return wrappedCb as T;
}
