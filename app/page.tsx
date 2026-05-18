import Link from "next/link";
import ViewCounter from "./components/ViewCounter";

export const revalidate = 0; // always fetch fresh data

export default function Home() {
  return (
    <div>
      <main className="min-h-screen flex flex-col items-center justify-center">
        <h1 className="text-3xl font-bold text-accent mb-2">PICOPI</h1>
        <p>
          <p>What can you do with a single button to push?</p>
          <Link href="/shortwave" className="text-accent text-sm">
            /sh0rtwave
          </Link>
          <p>One switch to flip?</p>
          <Link href="/toggle" className="text-accent text-sm">
            /toggle
          </Link>
          <p>A knob to turn?</p>
          <Link href="/hidden-radio" className="text-accent text-sm">
            /hidden-radio
          </Link>
        </p>
      </main>
    </div>
  );
}
