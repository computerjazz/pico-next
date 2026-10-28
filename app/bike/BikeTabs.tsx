"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useBikeSession } from "../components/BikeSessionProvider";

const tabs = [
  { name: "Stats", href: "/bike/stats" },
  { name: "Map", href: "/bike/map" },
  { name: "Combined", href: "/bike/combined" },
];

function TabBar({
  currentTab,
  setCurrentTab,
}: {
  currentTab: string;
  setCurrentTab: (path: string) => void;
}) {
  return (
    <div className="flex space-x-4 border-b border-muted-surface">
      {tabs.map((tab) => (
        <Link
          key={tab.name}
          href={tab.href}
          onClick={() => setCurrentTab(tab.href)}
          className={`px-4 py-2 font-medium cursor-pointer ${
            currentTab === tab.href
              ? "border-b-2 border-accent text-accent"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {tab.name}
        </Link>
      ))}
    </div>
  );
}

export default function BikeTabs({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [currentTab, setCurrentTab] = useState(path);

  useEffect(() => {
    setCurrentTab(path);
  }, [path]);

  const { speed, sessionSeconds } = useBikeSession();

  const paused = speed === 0;
  const idle = paused && sessionSeconds === 0;

  return (
    <div {...(idle ? { "data-theme": "dark" } : {})}>
      <div className="bg-background text-foreground">
        <div
          className={`flex flex-1 flex-col w-full min-h-screen max-h-screen ${idle ? "opacity-10" : ""}`}
        >
          <div className="flex flex-1 overflow-scroll">{children}</div>
          <div className="flex justify-center border-t border-muted-surface">
            <TabBar currentTab={currentTab} setCurrentTab={setCurrentTab} />
          </div>
        </div>
      </div>
    </div>
  );
}
