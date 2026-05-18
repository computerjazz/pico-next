import Link from "next/link";
import PageHeader from "./components/PageHeader";
import PicopiTitle from "./components/PicopiTitle";
import Pushbutton from "./components/icons/SchematicPushbutton";
import { IconProps } from "./components/icons/types";
import Switch from "./components/icons/SchematicToggle";
import Knob from "./components/icons/SchematicPotentiometer";

export const revalidate = 0; // always fetch fresh data

function Card({
  href,
  title,
  description,
  Icon,
}: {
  href: string;
  title: string;
  description: string;
  Icon: (props: IconProps) => React.ReactElement;
}) {
  return (
    <Link
      href={href}
      className="p-4 outline-1 outline-accent rounded-lg hover:bg-accent hover:text-accent-foreground cursor-pointer text-center group flex flex-col justify-center items-center gap-2"
    >
      <div className="flex">
        <Icon />
      </div>
      <p>{description}</p>
      <p className="font-bold text-accent text-xs group-hover:text-accent-foreground transition-colors">
        {title}
      </p>
    </Link>
  );
}

export default function Home() {
  return (
    <div>
      <main className="min-h-screen flex flex-col">
        <PageHeader>
          <PicopiTitle />
        </PageHeader>
        <div className="flex flex-1 flex-col items-center justify-center">
          <p>What can you do with...</p>
          <div className="flex flex-row gap-4 p-4">
            <Card
              href="/shortwave"
              title="/sh0rtwave"
              description="a button to push"
              Icon={Pushbutton}
            />
            <Card
              href="/toggle"
              title="/toggle"
              description="a switch to flip"
              Icon={Switch}
            />
            <Card
              href="/hidden-radio"
              title="/hidden-radio"
              description="a knob to turn"
              Icon={Knob}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
