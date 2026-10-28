"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BikeSessionProvider } from "../components/BikeSessionProvider";
import { MapProvider } from "../components/MapProvider";
import { BuiltRoute } from "./map/types";

const tabs = [
  { name: "Stats", href: "/bike/stats" },
  { name: "Map", href: "/bike/map" },
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

export default function BikeTabs({
  children,
  pulseCount,
  route,
}: {
  children: React.ReactNode;
  pulseCount: number;
  route: BuiltRoute | null;
}) {
  const path = usePathname();
  const [currentTab, setCurrentTab] = useState(path);

  useEffect(() => {
    setCurrentTab(path);
  }, [path]);

  return (
    <BikeSessionProvider pulseCount={pulseCount}>
      <MapProvider initialRoute={route}>
        <div className="flex flex-1 flex-col h-full w-full min-h-screen">
          <div className="flex flex-1">{children}</div>
          <div className="flex justify-center border-t border-muted-surface">
            <TabBar currentTab={currentTab} setCurrentTab={setCurrentTab} />
          </div>
        </div>
      </MapProvider>
    </BikeSessionProvider>
  );
}
