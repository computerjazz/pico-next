"use client";
import React, { useReducer } from "react";
import { signOut } from "next-auth/react";
import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import { Session } from "next-auth";
import { Device } from "@/db/schema";
import { setTheme } from "../actions/theme";
import Moon from "./icons/Moon";
import Sun from "./icons/Sun";

function ProfileMenuItem({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="w-full text-right px-4 py-2 hover:bg-accent hover:text-accent-foreground rounded"
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
  theme,
}: {
  session?: Session;
  devices: Device[];
  theme?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDark, setIsDark] = useState(theme === "dark");

  useEffect(() => {
    setTheme(isDark ? "dark" : "light");
  }, [isDark]);

  const toggleTheme = async () => {
    setIsDark((prev) => !prev);
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
                        window.location.assign(`/${d.type}/${d.deviceId}`)
                      }
                    />
                  );
                })}
              </React.Fragment>
            );
          })}
          <hr className="w-full border-t border-gray-700 my-2" />

          <div className="w-full flex justify-end gap-2 px-4 mt-4">
            <button onClick={() => setIsDark(false)} className="cursor-pointer">
              <Sun />
            </button>
            <div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isDark}
                  onChange={toggleTheme}
                  className="sr-only peer"
                  aria-checked={isDark}
                />
                <div className="w-11 h-6 bg-accent-foreground peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-offset-2 peer-focus:ring-muted-foreground rounded-full peer dark:bg-accent-foreground transition-colors peer-checked:bg-muted-foreground"></div>
                <div
                  className={`absolute left-0 top-0 w-6 h-6 rounded-full bg-white border border-gray-300 transition-transform duration-300 transform ${
                    isDark ? "translate-x-5" : ""
                  }`}
                ></div>
              </label>
            </div>
            <button onClick={() => setIsDark(true)} className="cursor-pointer">
              <Moon />
            </button>
          </div>

          <ProfileMenuItem
            label="Sign out"
            onClick={() => {
              if (!window.confirm("Are you sure you want to sign out?")) {
                return;
              }

              signOut();
            }}
          />
        </div>
      )}
    </div>
  );
}

export default ProfileButton;
