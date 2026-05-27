import HeroImage from "../components/HeroImage";
import PageHeader from "../components/PageHeader";

function TogglePage() {
  return (
    <div className="min-h-screen">
      <main className="flex flex-col">
        <PageHeader>
          <div className="flex flex-row gap-4 items-center">
            <h1 className="text-3xl font-bold text-accent mb-2">toggle</h1>
          </div>
        </PageHeader>
        <HeroImage
          src="/img/hero-toggle.jpg"
          alt="toggle hero"
          text="Stay in sync from afar (or don't)"
        />
        <div className="flex flex-col items-center">
          <div className="gap-4 max-w-lg flex flex-col p-4">
            <p>{`Keep one toggle and give the other to a friend. When they're both flipped the same way, the light stays green. Flip yours again to turn your friend's toggle red.`}</p>
            <p>{`How long will it take them to notice? Will they return the toggles back to green, or will they flip theirs again and turn YOURS red?`}</p>
            <p>{`Check the leaderboard to see who's spent the most time out of the red!`}</p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default TogglePage;
