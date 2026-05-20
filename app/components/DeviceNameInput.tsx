"use client";

import { Device } from "@/db/schema";
import { useState, useRef, useLayoutEffect } from "react";

function DeviceNameInput({
  device,
  disabled,
}: {
  device: Device;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
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
  }, [editing, name, draft]);

  // When switching into edit mode, focus input
  function startEdit() {
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
      className="flex items-center gap-2 font-bold text-2xl"
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
              onClick={startEdit}
            >
              {/* Pencil icon */}
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path
                  d="M13.293 2.293a1 1 0 0 1 1.414 0l3 3a1 1 0 0 1 0 1.414l-10 10a1 1 0 0 1-.39.242l-4 1.333a1 1 0 0 1-1.26-1.26l1.333-4a1 1 0 0 1 .242-.39l10-10zM15 4l1 1-9.293 9.293-1.242.414.414-1.242L15 4z"
                  fill="currentColor"
                />
              </svg>
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
            {/* Check icon */}
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M7.5 13.5L4 10l1.41-1.41L7.5 10.67l7.09-7.09L16 4l-8.5 9.5z"
                fill="currentColor"
              />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Cancel edit"
            className="text-muted-foreground hover:text-foreground transition cursor-pointer"
            onClick={cancelEdit}
            tabIndex={0}
          >
            {/* X icon */}
            <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
              <path
                d="M10 8.586l4.95-4.95 1.414 1.414L11.414 10l4.95 4.95-1.414 1.414L10 11.414l-4.95 4.95-1.414-1.414L8.586 10l-4.95-4.95L5.05 3.636 10 8.586z"
                fill="currentColor"
              />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}

export default DeviceNameInput;
