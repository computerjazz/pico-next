"use client";
import { useRefreshOnDeploy } from "@/app/hooks/useRefreshOnDeploy";

export function RefreshDaemon() {
  useRefreshOnDeploy();
  return null;
}
