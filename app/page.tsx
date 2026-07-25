import PageHeader from "./components/PageHeader";
import HomepageContent from "./components/HomepageContent";

export const revalidate = 0; // always fetch fresh data

export default function Home() {
  return (
    <div>
      <div className="absolute top-0 left-0 right-0 w-full">
        <PageHeader />
      </div>
      <HomepageContent />
    </div>
  );
}
