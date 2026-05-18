import ViewCounter from "./components/ViewCounter";

export const revalidate = 0; // always fetch fresh data

export default function Home() {
  return (
    <div>
      <main className="min-h-screen flex flex-col items-center justify-center">
        <h1 className="text-3xl font-bold text-accent mb-2">PICOPI</h1>
        <p>
          Fun little projects running on a Raspberry Pi in the laundry room.
        </p>
        <div className="flex flex-row gap-2">
          <a href="/shortwave" className="text-accent text-sm">
            /sh0rtwave
          </a>
          <a href="/gameoftext" className="text-accent text-sm">
            /game
          </a>
        </div>
        <div className="absolute bottom-10 w-full flex justify-center left-0">
          <ViewCounter id="homepage_views" />
        </div>
      </main>
    </div>
  );
}
