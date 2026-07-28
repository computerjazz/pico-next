import { useState, useEffect } from "react";

export const breakpoints = {
  xs: 340,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
};

export function useScreenWidth() {
  const [screenWidth, setScreenWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 0,
  );

  useEffect(() => {
    function handleResize() {
      setScreenWidth(window.innerWidth);
    }
    window.addEventListener("resize", handleResize);
    // Set on mount in case SSR mismatch
    handleResize();

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return { screenWidth };
}
