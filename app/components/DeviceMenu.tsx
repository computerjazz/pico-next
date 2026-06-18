"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { IconProps } from "./icons/types";
import EllipsesVertical from "./icons/EllipsesVertical";

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
      <Icon className="size-5" />
      {title}
    </button>
  );
}

type ItemConfig = {
  label: string;
  onClick: () => void;
  Icon: (props: IconProps) => ReactNode;
};

function DeviceMenu({
  disabled,
  items,
}: {
  items: ItemConfig[];
  disabled?: boolean;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="relative" ref={containerRef}>
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
      {isMenuOpen && (
        <div className="absolute right-0 mt-2 w-50 rounded shadow-lg z-50 bg-surface p-2 flex flex-col items-start">
          {items.map((item, i) => (
            <MenuItem
              key={`item-${i}`}
              title={item.label}
              onClick={() => {
                item.onClick();
                setIsMenuOpen(false);
              }}
              Icon={item.Icon}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default DeviceMenu;
