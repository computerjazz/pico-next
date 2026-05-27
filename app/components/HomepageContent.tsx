"use client";
import { useState } from "react";
import HomepageCards, { Card, HOMEPAGE_CARDS } from "./HomepageCards";
import Image from "next/image";

function HomepageContent() {
  const [hoveredCard, setHoveredCard] = useState<Card | null>(null);

  return (
    <main className="min-h-screen flex flex-col flex-1">
      {HOMEPAGE_CARDS.map((card) => {
        const isHovering = hoveredCard?.href === card.href;
        return (
          <div
            key={card.href}
            className={`absolute flex top-0 left-0 right-0 bottom-0 pointer-none:*: -z-10 transition-opacity duration-500 ${isHovering ? "opacity-25" : "opacity-0"}`}
          >
            <Image
              src={card.src || ""}
              alt={card.title}
              fill
              className="object-cover w-full h-full"
              loading="eager"
              sizes="100vw"
              priority={false}
              quality={50}
            />
          </div>
        );
      })}
      <div className="flex flex-1 flex-col items-center justify-center p-4">
        <p>Simple connected toys built from just one...</p>
        <div className="flex flex-row gap-4 p-4 flex-wrap items-center justify-center">
          <HomepageCards onCardHover={setHoveredCard} />
        </div>
      </div>
    </main>
  );
}
export default HomepageContent;
