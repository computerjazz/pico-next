"use client";

function PillButton({
  label,
  onClick,
  type = "button",
  className,
}: {
  label: string;
  onClick?: () => void;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      className={`text-xs inline-flex items-center px-3 py-1 rounded-full bg-accent-surface text-accent-foreground font-medium hover:bg-accent transition cursor-pointer border-2 ${className}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export default PillButton;
