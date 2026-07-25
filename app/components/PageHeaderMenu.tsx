"use client";

import { getPicopiO } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isTruthy } from "../../lib/utils";

const breakpoints = {
  xs: 340,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
};

function useScreenWidth() {
  const [screenWidth, setScreenWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 0,
  );

  useEffect(() => {
    function handleResize() {
      setScreenWidth(window.innerWidth);
    }
    window.addEventListener("resize", handleResize);
    // Set on mount in case SSR mismatch
    handleResize();

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return { screenWidth };
}

function getInitialPathSegment(pathname: string) {
  return pathname.split("/").filter(isTruthy)[0];
}

function PageHeaderMenu({ title }: { title?: string | null }) {
  const picopiName = `pic${getPicopiO()}pi`;
  const menuRoutes = [
    {
      name: "Shortwave",
      pathname: "/shortwave",
    },
    {
      name: "Toggle",
      pathname: "/toggle",
    },
    {
      name: "Hidden Radio",
      pathname: "/hidden-radio",
    },
    // {
    //   name: "Blog",
    //   pathname: "/blog",
    // },
    {
      name: picopiName,
      pathname: "/",
    },
  ];

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
