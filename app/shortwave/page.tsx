import PageHeader from "../components/PageHeader";
import Image from "next/image";

export const revalidate = 0; // always fetch fresh data

export default function ShortwaveLanding() {
  return (
    <div className="min-h-screen">
      <main className="flex flex-col gap-6">
        <PageHeader>
          <div className="flex flex-row gap-4 items-center">
            <h1 className="text-3xl font-bold text-accent mb-2">sh0rtwave</h1>
          </div>
        </PageHeader>
        <div className="w-full h-128 overflow-hidden flex justify-center items-center">
          <Image
            width={1024}
            height={1024}
            src="/hero-shortwave.jpg"
            alt="Shortwave Hero"
            className="w-full h-auto object-cover"
            style={{ objectPosition: "center 33%" }}
            priority
          />
        </div>
        <p className="max-w-lg text-base text-muted-foreground text-center">
          Press the big button to send a voice message.
        </p>

        <div className="flex flex-row gap-4 mt-6"></div>
      </main>
    </div>
  );
}
