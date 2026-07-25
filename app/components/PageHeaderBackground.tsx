"use client";
import React from "react";

function PageHeaderBackground({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-4 flex flex-row justify-between gap-4 sticky top-0 z-50 bg-background">
      {children}
    </div>
  );
}

export default PageHeaderBackground;
