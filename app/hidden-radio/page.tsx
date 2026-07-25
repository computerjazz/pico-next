import HeroImage from "../components/HeroImage";
import PageHeader from "../components/PageHeader";

function HiddenRadioPage() {
  return (
    <div className="min-h-screen">
      <main className="flex flex-col">
        <PageHeader title="Hidden Radio" />
        <HeroImage
          src="/img/hero-hidden-radio.jpg"
          alt="hero hidden radio"
          text="Explore what's off the edge of the radio dial"
        />
        <div className="flex flex-col items-center">
          <div className="gap-4 max-w-lg flex flex-col p-4">
            <p>{`Radio stations are just a small sliver of the radio spectrum.`}</p>
            <p>{`Hidden Radio helps you discover the rest of it.`}</p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default HiddenRadioPage;
