import PageHeader from "./components/PageHeader";
import HomepageContent from "./components/HomepageContent";
import { PICOPI_O_OPTIONS } from "@/lib/constants";

export const revalidate = 0; // always fetch fresh data

function getO() {
  const oIdx = Math.floor(Math.random() * PICOPI_O_OPTIONS.length);
  return PICOPI_O_OPTIONS[oIdx];
}

export default function Home() {
  return (
    <div>
      <div className="absolute top-0 left-0 right-0 w-full">
        <PageHeader>
          <h1 className="text-3xl font-bold text-accent mb-2">{`pic${getO()}pi`}</h1>
        </PageHeader>
      </div>
      <HomepageContent />
    </div>
  );
}
