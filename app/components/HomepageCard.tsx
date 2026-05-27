"use client";

import Link from "next/link";
import { IconProps } from "./icons/types";

function HomepageCard({
  href,
  title,
  description,
  Icon,
  HoverIcon = Icon,
}: {
  href: string;
  title: string;
  description: string;
  Icon: React.ComponentType<IconProps>;
  HoverIcon?: React.ComponentType<IconProps>;
}) {
  return (
    <Link
      href={href}
      className="p-4 outline-1 outline-accent rounded-lg hover:bg-accent hover:text-accent-foreground cursor-pointer text-center group flex flex-col justify-center items-center gap-2 w-3xs"
    >
      <div className="flex">
        {/* Icon swap on hover */}
        <span className="block group-hover:hidden">
          <Icon />
        </span>
        <span className="hidden group-hover:block">
          <HoverIcon />
        </span>
      </div>
      <p>{description}</p>
      <p className="font-bold text-accent text-xs group-hover:text-accent-foreground transition-colors">
        {title}
      </p>
    </Link>
  );
}
export default HomepageCard;
