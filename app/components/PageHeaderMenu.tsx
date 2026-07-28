"use client";

import { getMenuRoutes, getPicopiName } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isTruthy } from "../../lib/utils";
import { useScreenWidth, breakpoints } from "../hooks/useScreenWidth";

function getInitialPathSegment(pathname: string) {
  return pathname.split("/").filter(isTruthy)[0];
}

function PageHeaderMenu({ title }: { title?: string | null }) {
  const picopiName = getPicopiName();
  const { routes: menuRoutes } = getMenuRoutes();

  const pathname = usePathname();
  const { screenWidth } = useScreenWidth();
  const shouldShowMenu = screenWidth >= breakpoints.lg;
  const _title =
    (title || menuRoutes.find((r) => r.pathname === pathname)?.name) ?? "";

  return (
    <div className="flex flex-1 gap-4 items-center">
      <Link href="/" className="text-3xl font-bold text-accent">
        {shouldShowMenu ? picopiName : _title}
      </Link>
      <div className="flex flex-1 self-center items-center gap-6 ml-4">
        {shouldShowMenu &&
          menuRoutes.map((routeConfig) => {
            const isActiveRoute =
              getInitialPathSegment(pathname) ===
              getInitialPathSegment(routeConfig.pathname);
            if (routeConfig.pathname === "/" && shouldShowMenu) return null;
            return (
              <Link
                key={routeConfig.pathname}
                href={routeConfig.pathname}
                className={
                  isActiveRoute ? `font-black text-accent underline` : ``
                }
              >
                {routeConfig.name}
              </Link>
            );
          })}
      </div>
    </div>
  );
}

export default PageHeaderMenu;
