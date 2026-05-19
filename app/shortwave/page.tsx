import PageHeader from "../components/PageHeader";
import Image from "next/image";

export const revalidate = 0; // always fetch fresh data

export default function ShortwaveLanding() {
  return (
    <div className="min-h-screen">
      <main className="flex flex-col">
        <PageHeader>
          <div className="flex flex-row gap-4 items-center">
            <h1 className="text-3xl font-bold text-accent mb-2">sh0rtwave</h1>
          </div>
        </PageHeader>
        <Image
          width={1024}
          height={128}
          src="/hero-shortwave.jpg"
          alt="Shortwave Hero"
          className="w-full aspect-[2.5/1] object-cover"
          priority
        />

        <p className="max-w-lg text-base text-muted-foreground text-center mt-4">
          Press the big button to send a voice message.
        </p>

        <div className="flex flex-row gap-4 mt-6"></div>
      </main>
    </div>
  );
}
