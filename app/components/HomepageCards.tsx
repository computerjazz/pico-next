"use client";

import HomepageCard from "./HomepageCard";
import Knob from "./icons/Knob";
import RadioButtonOn from "./icons/RadioButtonOn";
import SchematicPotentiometer from "./icons/SchematicPotentiometer";
import SchematicPushbutton from "./icons/SchematicPushbutton";
import SchematicToggle from "./icons/SchematicToggle";
import ToggleOn from "./icons/ToggleOn";

function HomepageCards() {
  return (
    <>
      <HomepageCard
        href="/shortwave"
        title="/sh0rtwave"
        description="a button to push"
        Icon={RadioButtonOn}
        HoverIcon={SchematicPushbutton}
      />
      <HomepageCard
        href="/toggle"
        title="/toggle"
        description="a switch to flip"
        Icon={ToggleOn}
        HoverIcon={SchematicToggle}
      />
      <HomepageCard
        href="/hidden-radio"
        title="/hidden-radio"
        description="a knob to turn"
        Icon={Knob}
        HoverIcon={SchematicPotentiometer}
      />
    </>
  );
}

export default HomepageCards;
