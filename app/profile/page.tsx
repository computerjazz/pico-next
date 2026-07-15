import { auth } from "@/auth";
import { db } from "@/db";
import { notFound } from "next/navigation";
import PageHeader from "../components/PageHeader";
import { Device } from "@/db/schema";
import Link from "next/link";
import React from "react";

function ListItem({
  label,
  href,
  onClick,
  children,
}: {
  label?: string;
  href: string;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Link
      className="w-full px-4 py-2 hover:bg-accent hover:text-accent-foreground rounded cursor-pointer"
      href={href}
      onClick={onClick}
    >
      {children || label}
    </Link>
  );
}

export default async function ProfilePage() {
  const session = await auth();
  const sessionUser = session?.user;
  if (!sessionUser) return notFound();

  const userDevices = await db.query.devices.findMany({
    where: (t, { eq }) => eq(t.userId, sessionUser.id ?? ""),
  });

  const name = sessionUser.name;
  const devicesGrouped = userDevices.reduce((acc, cur) => {
    const existing = acc.get(cur.type) ?? [];
    existing.push(cur);
    acc.set(cur.type, existing);
    return acc;
  }, new Map<string, Device[]>());

  return (
    <div>
      <PageHeader>
        <h1 className="text-3xl font-bold text-accent mb-2">{name}</h1>
      </PageHeader>
      <div className="p-4">
        <h1 className="font-bold text-xl">Devices</h1>
        <div className="flex flex-col">
          {[...devicesGrouped.entries()].map(([type, devicesInGroup]) => {
            return (
              <React.Fragment key={type}>
                <ListItem href={`/${type}`}>
                  <Link href={`/${type}`} className="font-bold mt-4 underline">
                    {type}
                  </Link>
                </ListItem>
                <div className="ml-4 flex flex-col">
                  {devicesInGroup
                    .sort((a, b) => {
                      const aName = a.name || a.deviceId;
                      const bName = b.name || b.deviceId;
                      return aName < bName ? -1 : 1;
                    })
                    .map((d) => {
                      return (
                        <ListItem
                          key={d.deviceId}
                          label={d.name ?? d.deviceId}
                          href={`/${d.type}/${d.deviceId}`}
                        />
                      );
                    })}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
