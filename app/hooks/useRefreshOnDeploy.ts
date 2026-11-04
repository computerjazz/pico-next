"use client";
import { useEffect } from "react";

export function useRefreshOnDeploy() {
  useEffect(() => {
    const mine = process.env.NEXT_PUBLIC_BUILD_ID;
    if (!mine) return;
    const check = async () => {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const { version } = await r.json();
        if (version && version !== mine) location.reload();
      } catch {}
    };
    const id = setInterval(check, 60_000);
    const onVis = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  return null;
}
