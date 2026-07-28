"use client";
import React from "react";
import { signOut } from "next-auth/react";
import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import { Session } from "next-auth";
import { Device } from "@/db/schema";
import { setTheme } from "../actions/theme";
import Moon from "./icons/Moon";
import Sun from "./icons/Sun";
import { useConfirm } from "./ConfirmDialog";
import Switch from "./Switch";
import BarsThree from "./icons/BarsThree";
import XMark from "./icons/XMark";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { getMenuRoutes } from "@/lib/utils";

function ProfileMenuItem({
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
      className="w-full text-right px-4 py-2 hover:bg-accent hover:text-accent-foreground rounded cursor-pointer"
      href={href}
      onClick={onClick}
    >
      {children || label}
    </Link>
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
  const { confirm, ConfirmDialog } = useConfirm();

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

  const { routes: menuRoutes } = getMenuRoutes();

  return (
    <div ref={containerRef}>
      <button
        className="cursor-pointer select-none"
        tabIndex={0}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <BarsThree className="size-6" />
      </button>
      <div className={`fixed top-0 bottom-0 right-0 z-50`}>
        <AnimatePresence>
          {open && (
            <>
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.3}
                onDragEnd={(_, info) => {
                  // If dragged more than 100 pixels to the right, dismiss (close menu)
                  if (info.offset.x > 100) setOpen(false);
                }}
                className="h-dvh w-60 rounded shadow-lg bg-surface p-2 flex flex-col items-end overflow-y-scroll touch-pan-x"
                style={{ touchAction: "pan-x" }}
              >
                <button
                  className="cursor-pointer select-none p-2"
                  type="button"
                  onClick={() => setOpen(false)}
                >
                  <XMark className="size-6" />
                </button>
                <ProfileMenuItem href="/profile">
                  <div className="flex flex-row items-center gap-4 justify-end">
                    <div className="w-6 h-6">
                      {user.image ? (
                        <Image
                          alt="pfp"
                          className="rounded-full aspect-square min-w-6"
                          width="24"
                          height="24"
                          src={user.image}
                        />
                      ) : (
                        <span className="font-bold">
                          {user.name?.[0] || user.email?.[0]}
                        </span>
                      )}
                    </div>
                    <div className="text-sm self-end font-bold">
                      {user.name}
                    </div>
                  </div>
                </ProfileMenuItem>
                {menuRoutes
                  .filter((r) => r.pathname !== "/")
                  .map((route) => {
                    const type = route.deviceType ?? "";
                    const devicesInGroup = devicesGrouped.get(type) ?? [];
                    return (
                      <React.Fragment key={type}>
                        <ProfileMenuItem href={route.pathname}>
                          <span className="font-bold mt-4 underline">
                            {route.name}
                          </span>
                        </ProfileMenuItem>
                        {devicesInGroup
                          .sort((a, b) => {
                            const aName = a.name || a.deviceId;
                            const bName = b.name || b.deviceId;
                            return aName < bName ? -1 : 1;
                          })
                          .map((d) => {
                            return (
                              <ProfileMenuItem
                                key={d.deviceId}
                                label={d.name ?? d.deviceId}
                                href={`/${d.type}/${d.deviceId}`}
                              />
                            );
                          })}
                      </React.Fragment>
                    );
                  })}
                <hr className="w-full border-t border-gray-700 my-2" />
                <div className="w-full flex justify-end gap-2 px-4 mt-4">
                  <button
                    onClick={() => setIsDark(false)}
                    className="cursor-pointer"
                  >
                    <Sun />
                  </button>
                  <Switch isOn={isDark} onChange={toggleTheme} />
                  <button
                    onClick={() => setIsDark(true)}
                    className="cursor-pointer"
                  >
                    <Moon />
                  </button>
                </div>
                <ProfileMenuItem
                  label="Sign out"
                  href="#"
                  onClick={async () => {
                    const ok = await confirm({
                      description: "Are you sure you want to sign out?",
                      destructive: true,
                      confirmText: "Leave",
                      cancelText: "Stay",
                    });
                    if (!ok) return;
                    signOut();
                  }}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
      {ConfirmDialog}
    </div>
  );
}

export default ProfileButton;
