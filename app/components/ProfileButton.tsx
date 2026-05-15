"use client";
import React from "react";
import { signOut } from "next-auth/react";
import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import { Session } from "next-auth";
import { Device } from "@/db/schema";

function ProfileMenuItem({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="w-full text-right px-4 py-2 hover:bg-accent rounded"
      onClick={onClick}
      tabIndex={0}
      type="button"
    >
      {label}
    </button>
  );
}

function ProfileButton({
  session,
  devices,
}: {
  session?: Session;
  devices: Device[];
}) {
  const [open, setOpen] = useState(false);
  const [isDark, setIsDark] = useState(
    document.documentElement.classList.contains("dark"),
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  // Listen for clicks outside the container to close the dropdown
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Keyboard: close menu on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const user = session?.user;
  if (!user) return null;

  const devicesGrouped = devices.reduce((acc, cur) => {
    const existing = acc.get(cur.type) ?? [];
    existing.push(cur);
    acc.set(cur.type, existing);
    return acc;
  }, new Map<string, Device[]>());

  return (
    <div className="relative" ref={containerRef}>
      <button
        className="bg-gray-800 rounded-full outline-1 cursor-pointer select-none"
        tabIndex={0}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {user.image ? (
          <Image
            alt="pfp"
            className="rounded-full"
            width="30"
            height="30"
            src={user.image}
          />
        ) : (
          <div className="w-6 h-6">
            <span className="font-bold">
              {user.name?.[0] || user.email?.[0]}
            </span>
          </div>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-60 rounded shadow-lg z-50 bg-surface p-2 flex flex-col items-end">
          <span className="text-sm self-end px-4 font-bold mt-2 mb-2">
            {user.name}
          </span>
          {[...devicesGrouped.entries()].map(([type, devicesInGroup]) => {
            return (
              <React.Fragment key={type}>
                <span className="font-bold mt-2 px-4">{type}</span>
                {devicesInGroup.map((d) => {
                  return (
                    <ProfileMenuItem
                      key={d.deviceId}
                      label={d.name ?? d.deviceId}
                      onClick={() =>
                        window.location.assign(`/device/${d.deviceId}`)
                      }
                    />
                  );
                })}
              </React.Fragment>
            );
          })}
          <hr className="w-full border-t border-gray-700 my-2" />

          <ProfileMenuItem
            label={isDark ? "Light mode" : "Dark mode"}
            onClick={toggleTheme}
          />
          <ProfileMenuItem label="Sign out" onClick={signOut} />
        </div>
      )}
    </div>
  );
}

export default ProfileButton;
