import { IconProps } from "./types";

function SchematicPotentiometer({ className = "size-6" }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Arrow shaft with greater gap */}
      <path
        d="M12 3.5v3.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Arrow head further from resistor */}
      <path
        d="M10.8 6.7L12 7.9l1.2-1.2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Squiggly resistor line lower for bigger gap */}
      <path d="M2 15h2l2-5l3 10l3-10l3 10l3-10l1.5 5h2.5" />
    </svg>
  );
}

export default SchematicPotentiometer;
