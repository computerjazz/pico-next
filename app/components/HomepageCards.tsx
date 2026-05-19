"use client";

import HomepageCard from "./HomepageCard";
import Knob from "./icons/Knob";
import RadioButtonOn from "./icons/RadioButtonOn";
import SchematicPotentiometer from "./icons/SchematicPotentiometer";
import SchematicPushbutton from "./icons/SchematicPushbutton";
import SchematicToggle from "./icons/SchematicToggle";
import ToggleOn from "./icons/ToggleOn";
import { IconProps } from "./icons/types";

export type Card = {
  href: string;
  title: string;
  description: string;
  Icon: React.ComponentType<IconProps>;
  HoverIcon: React.ComponentType<IconProps>;
  src?: string;
};

const cards: Card[] = [
  {
    href: "/shortwave",
    title: "/sh0rtwave",
    description: "button to push",
    Icon: RadioButtonOn,
    HoverIcon: SchematicPushbutton,
    src: "/hero-shortwave.jpg",
  },
  {
    href: "/toggle",
    title: "/toggle",
    description: "switch to flip",
    Icon: ToggleOn,
    HoverIcon: SchematicToggle,
  },
  {
    href: "/hidden-radio",
    title: "/hidden-radio",
    description: "knob to turn",
    Icon: Knob,
    HoverIcon: SchematicPotentiometer,
  },
];

function HomepageCards({
  onCardHover,
}: {
  onCardHover?: (card: Card | null) => void;
}) {
  return (
    <>
      {cards.map((card) => (
        <div
          key={card.href}
          onMouseEnter={() => onCardHover?.(card)}
          onMouseLeave={() => onCardHover?.(null)}
        >
          <HomepageCard
            key={card.href}
            href={card.href}
            title={card.title}
            description={card.description}
            Icon={card.Icon}
            HoverIcon={card.HoverIcon}
          />
        </div>
      ))}
    </>
  );
}

export default HomepageCards;
