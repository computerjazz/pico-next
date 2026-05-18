import Link from "next/link";
import PageHeader from "./components/PageHeader";

export const revalidate = 0; // always fetch fresh data

function Card({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="p-4 outline-1 outline-accent rounded-lg hover:bg-accent hover:text-accent-foreground cursor-pointer text-center group"
    >
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
          <h1 className="text-3xl font-bold text-accent mb-2">PICOPI</h1>
        </PageHeader>
        <div className="flex flex-1 flex-col items-center justify-center">
          <p>What can you do with...</p>
          <div className="flex flex-row gap-4 p-4">
            <Card
              href="/shortwave"
              title="/sh0rtwave"
              description="a button to push"
            />
            <Card
              href="/toggle"
              title="/toggle"
              description="a switch to flip"
            />
            <Card
              href="/hidden-radio"
              title="/hidden-radio"
              description="a knob to turn"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
