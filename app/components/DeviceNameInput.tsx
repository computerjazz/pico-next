"use client";

import { Device } from "@/db/schema";
import { useState, useRef, useLayoutEffect, useEffect } from "react";
import XCircle from "./icons/XCircle";
import CheckCircle from "./icons/CheckCircle";

function DeviceNameInput({
  device,
  isEditing,
  onEditComplete,
}: {
  device: Device;
  isEditing?: boolean;
  onEditComplete: () => void;
}) {
  const [name, setName] = useState(device.name ?? "");
  const [draft, setDraft] = useState(device.name ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const spanRef = useRef<HTMLSpanElement>(null);

  // Hold the measured height of the row to lock when transition occurs
  const [rowHeight, setRowHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    // Measure and lock the height before a mode switch
    if (containerRef.current) {
      setRowHeight(containerRef.current.offsetHeight);
    }
  }, [isEditing, name, draft]);

  useEffect(() => {
    function onEditStart() {
      setDraft(name);
      setTimeout(() => inputRef.current?.focus(), 0);
    }

    if (isEditing) onEditStart();
  }, [isEditing, name]);

  function cancelEdit() {
    setDraft(name);
    onEditComplete();
  }

  // Accept changes, trigger form submit
  function acceptEdit() {
    setName(draft.trim());
    onEditComplete();
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
      style={rowHeight !== undefined ? { minHeight: rowHeight } : undefined}
    >
      {!isEditing ? (
        <>
          <span
            ref={spanRef}
            title={name || "Unnamed"}
            className="inline-block text-accent"
          >
            {name || <span className="italic">Unnamed</span>}
          </span>
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
                  onEditComplete();
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
    </div>
  );
}

export default DeviceNameInput;
