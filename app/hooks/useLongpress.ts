import { useRef } from "react";

export function useLongpress(cb: () => void, ms = 300) {
  const timeoutRef: React.RefObject<NodeJS.Timeout | null> = useRef(null);

  function clear() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }
  return {
    onPointerDown: () => {
      clear();
      timeoutRef.current = setTimeout(() => {
        cb();
        timeoutRef.current = null;
      }, ms);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
  };
}
