"use client";

import { Device } from "@/db/schema";
import { useState, useRef, useLayoutEffect, useEffect, ReactNode } from "react";
import PencilMini from "./icons/PencilMini";
import XCircle from "./icons/XCircle";
import CheckCircle from "./icons/CheckCircle";
import EllipsesVertical from "./icons/EllipsesVertical";
import { IconProps } from "./icons/types";
import Share from "./icons/Share";
import { shareDevice } from "../actions/shareDevice";

function MenuItem({
  Icon,
  title,
  onClick,
}: {
  Icon: (props: IconProps) => ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      className="w-full flex gap-2 items-start text-sm px-4 py-2 hover:bg-accent hover:text-accent-foreground rounded cursor-pointer"
      onClick={onClick}
    >
      <Icon />
      {title}
    </button>
  );
}

function DeviceNameInput({
  device,
  disabled,
}: {
  device: Device;
  disabled?: boolean;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(device.name ?? "");
  const [draft, setDraft] = useState(device.name ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const spanRef = useRef<HTMLSpanElement>(null);

  // Hold the measured height of the row to lock when transition occurs
  const [rowHeight, setRowHeight] = useState<number | undefined>(undefined);

  // Listen for clicks outside the container to close the dropdown
  useEffect(() => {
    if (!isMenuOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMenuOpen]);

  useLayoutEffect(() => {
    // Measure and lock the height before a mode switch
    if (containerRef.current) {
      setRowHeight(containerRef.current.offsetHeight);
    }
  }, [editing, name, draft]);

  async function _shareDevice() {
    const {
      share: { redeemCode },
    } = await shareDevice({
      deviceId: device.deviceId,
    });
    await navigator.clipboard.writeText(
      `${window.location.origin}/shortwave/${device.deviceId}/share/${redeemCode}`,
    );
  }

  // When switching into edit mode, focus input
  function startEdit() {
    setIsMenuOpen(false);
    setDraft(name);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function cancelEdit() {
    setDraft(name);
    setEditing(false);
  }

  // Accept changes, trigger form submit
  function acceptEdit() {
    setName(draft.trim());
    setEditing(false);
    // find and submit the surrounding form
    inputRef.current?.form?.requestSubmit();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      acceptEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  }

  return (
    <div
      ref={containerRef}
      className="flex items-center gap-2 font-bold text-2xl relative"
      style={
        rowHeight !== undefined
          ? { minHeight: rowHeight, height: rowHeight }
          : undefined
      }
    >
      {!editing ? (
        <>
          <span
            ref={spanRef}
            title={name || "Unnamed"}
            className="inline-block text-accent"
          >
            {name || <span className="italic">Unnamed</span>}
          </span>
          {!disabled && (
            <button
              type="button"
              disabled={disabled}
              aria-label="Edit device name"
              className="hover:text-accent text-muted-foreground transition cursor-pointer"
              onClick={() => setIsMenuOpen(true)}
            >
              <EllipsesVertical />
            </button>
          )}
          {/* Hidden input to support outside form submission */}
          <input type="hidden" name="name" value={name} />
        </>
      ) : (
        <>
          <input
            id="deviceName"
            name="deviceName"
            type="text"
            ref={inputRef}
            className="w-full px-2 py-1 border rounded outline-accent"
            maxLength={50}
            autoComplete="off"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              // Lock height to prevent jump
              height: rowHeight ? rowHeight - 2 : undefined, // adjust for border if needed
              boxSizing: "border-box",
              transition: "height 0.1s",
            }}
            onBlur={() => {
              setTimeout(() => {
                if (
                  document.activeElement !== inputRef.current &&
                  !(
                    document.activeElement &&
                    (document.activeElement as HTMLElement).getAttribute(
                      "aria-label",
                    ) === "Save device name"
                  ) &&
                  !(
                    document.activeElement &&
                    (document.activeElement as HTMLElement).getAttribute(
                      "aria-label",
                    ) === "Cancel edit"
                  )
                ) {
                  setEditing(false);
                }
              }, 100);
            }}
          />
          <button
            type="button"
            aria-label="Save device name"
            className="text-accent-surface hover:text-accent transition cursor-pointer"
            onClick={acceptEdit}
            tabIndex={0}
          >
            <CheckCircle />
          </button>
          <button
            type="button"
            aria-label="Cancel edit"
            className="text-muted-foreground hover:text-foreground transition cursor-pointer"
            onClick={cancelEdit}
            tabIndex={0}
          >
            <XCircle />
          </button>
        </>
      )}
      {isMenuOpen && (
        <div className="absolute right-0 mt-2 w-40 rounded shadow-lg z-50 bg-surface p-2 flex flex-col items-start">
          <MenuItem title="Edit name" Icon={PencilMini} onClick={startEdit} />
          <MenuItem title="Share device" Icon={Share} onClick={_shareDevice} />
        </div>
      )}
    </div>
  );
}

export default DeviceNameInput;
