"use client";
import { useState } from "react";
import HomepageCards, { Card } from "./HomepageCards";
import Image from "next/image";

function HomepageContent() {
  const [hoveredCard, setHoveredCard] = useState<Card | null>(null);
  const [isHovering, setIsHovering] = useState(false);

  return (
    <main className="min-h-screen flex flex-col flex-1 items-center justify-center">
      <div
        className={`absolute flex top-0 left-0 right-0 bottom-0 pointer-none:*: -z-10 transition-opacity duration-500 ${isHovering ? "opacity-25" : "opacity-0"}`}
      >
        {!!hoveredCard?.src && (
          <Image
            src={hoveredCard.src}
            alt={hoveredCard.title}
            fill
            className={`object-cover w-full h-full`}
            priority
          />
        )}
      </div>
      <p>Surprisingly deep toys built from just one...</p>
      <div className="flex flex-row gap-4 p-4">
        <HomepageCards
          onCardHover={(card) => {
            if (card?.src) setHoveredCard(card);
            setIsHovering(!!card);
          }}
        />
      </div>
    </main>
  );
}
export default HomepageContent;
