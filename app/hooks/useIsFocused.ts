import { useEffect, useState } from "react";

export function useIsFocused() {
  const [isDocumentFocused, setIsDocumentFocused] = useState(
    document.visibilityState === "visible",
  );

  const [isWindowFocused, setIsWindowFocused] = useState(() =>
    typeof window !== "undefined" ? document.hasFocus() : true,
  );

  useEffect(() => {
    const documentHandler = () => {
      setIsDocumentFocused(document.visibilityState === "visible");
    };

    const handleWindowFocus = () => {
      setIsWindowFocused(true);
    };

    const handleWindowBlur = () => {
      setIsWindowFocused(false);
    };
    document.addEventListener("visibilitychange", documentHandler);
    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      document.removeEventListener("visibilitychange", documentHandler);
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, []);

  return {
    isFocused: isDocumentFocused && isWindowFocused,
  };
}
