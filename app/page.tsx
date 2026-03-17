import ViewCounter from "./components/ViewCounter";
import "./gameoftext/gameoftext.css";

export const revalidate = 0; // always fetch fresh data

export default function Home() {
  return (
    <div id="console">
      <main className="min-h-screen flex flex-col items-center justify-center">
        <h1>PICOPI.CC</h1>
        <p>
          A tiny next.js app running on a Raspberry Pi in the laundry room.
        </p>
        <ViewCounter id="homepage_views" />
      </main>
    </div>
  );
}
