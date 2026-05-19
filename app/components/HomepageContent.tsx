"use client";
import { useState } from "react";
import HomepageCards, { Card } from "./HomepageCards";
import Image from "next/image";

function HomepageContent() {
  const [hoveredCard, setHoveredCard] = useState<Card | null>(null);

  return (
    <main className="min-h-screen flex flex-col flex-1 items-center justify-center">
      <div className="absolute flex top-0 left-0 right-0 bottom-0 pointer-none:*: -z-10">
        <Image
          src={hoveredCard?.src || ""}
          alt={hoveredCard?.title || ""}
          fill
          className="object-cover w-full h-full transition-opacity duration-500"
          style={{ opacity: hoveredCard?.src ? 0.25 : 0 }}
          priority
        />
      </div>
      <p>Surprisingly deep toys from just one...</p>
      <div className="flex flex-row gap-4 p-4">
        <HomepageCards onCardHover={setHoveredCard} />
      </div>
    </main>
  );
}
export default HomepageContent;
