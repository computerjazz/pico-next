import PageHeader from "./components/PageHeader";
import PicopiTitle from "./components/PicopiTitle";
import SchematicPushbutton from "./components/icons/SchematicPushbutton";
import SchematicToggle from "./components/icons/SchematicToggle";
import SchematicPotentiometer from "./components/icons/SchematicPotentiometer";
import HomepageCard from "./components/HomepageCard";
import RadioButtonOn from "./components/icons/RadioButtonOn";
import ToggleOn from "./components/icons/ToggleOn";
import Knob from "./components/icons/Knob";
import HomepageCards from "./components/HomepageCards";

export const revalidate = 0; // always fetch fresh data

export default function Home() {
  return (
    <div>
      <main className="min-h-screen flex flex-col">
        <PageHeader>
          <PicopiTitle />
        </PageHeader>
        <div className="flex flex-1 flex-col items-center justify-center">
          <p>Surprisingly deep toys from just one...</p>
          <div className="flex flex-row gap-4 p-4">
            <HomepageCards />
          </div>
        </div>
      </main>
    </div>
  );
}
