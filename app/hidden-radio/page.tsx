import HeroImage from "../components/HeroImage";
import PageHeader from "../components/PageHeader";

function HiddenRadioPage() {
  return (
    <div className="min-h-screen">
      <main className="flex flex-col gap-6">
        <PageHeader>
          <div className="flex flex-row gap-4 items-center">
            <h1 className="text-3xl font-bold text-accent mb-2">
              hidden radio
            </h1>
          </div>
        </PageHeader>
        <HeroImage
          src="/img/hero-hidden-radio.jpg"
          alt="hero hidden radio"
          text="Listen to the signals off the dial"
        />
        <div className="flex flex-col items-center">
          <div className="gap-4 max-w-lg flex flex-col p-4">
            <p>{`When we turn on the radio, we usually listen to the stations that broadcast between 87.9 FM and 108.0 FM.`}</p>
            <p>{`But radio is much, much bigger than that.`}</p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default HiddenRadioPage;
