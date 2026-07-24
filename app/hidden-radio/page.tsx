import HeroImage from "../components/HeroImage";
import PageHeader from "../components/PageHeader";

function HiddenRadioPage() {
  return (
    <div className="min-h-screen">
      <main className="flex flex-col">
        <PageHeader>
          <div className="flex flex-row gap-4 items-center">
            <h1 className="text-3xl font-bold text-accent">hidden radio</h1>
          </div>
        </PageHeader>
        <HeroImage
          src="/img/hero-hidden-radio.jpg"
          alt="hero hidden radio"
          text="Discover what's off the edge of the dial"
        />
        <div className="flex flex-col items-center">
          <div className="gap-4 max-w-lg flex flex-col p-4">
            <p>{`Radio stations broadcast on a narrow band of frequencies.`}</p>
            <p>{`Hidden Radio lets you listen to the rest of the spectrum.`}</p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default HiddenRadioPage;
