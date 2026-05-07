"use client";

import { signOut } from "next-auth/react";
import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import { Session } from "next-auth";

function ProfileButton({ session }: { session?: Session }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="relative" ref={containerRef}>
      <button
        className="inline-flex flex-row gap-2 items-center bg-gray-800 p-2 rounded outline-1 cursor-pointer select-none"
        tabIndex={0}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {user.image && (
          <Image
            alt="pfp"
            className="rounded-full"
            width="30"
            height="30"
            src={user.image}
          />
        )}
        <span>{user.name}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-40 bg-white rounded shadow-lg z-50">
          <button
            className="w-full text-left px-4 py-2 text-gray-800 hover:bg-gray-100 rounded"
            onClick={() => signOut()}
            tabIndex={0}
            type="button"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default ProfileButton;
