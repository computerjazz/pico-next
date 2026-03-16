export const revalidate = 0; // always fetch fresh data

import { getRedis } from "@/lib/redis";

export default async function Home() {
  const redis = await getRedis();

  const views = await redis.incr("homepage_views");

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            PICOPI.CC
          </h1>
          <div className="flex flex-col items-center gap-6">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              A tiny next.js app running on a Raspberry Pi in the laundry room.
            </p>
            <p>
              <div
                className="w-full flex justify-center z-50"
                suppressHydrationWarning
              >
                <div
                  className="grid grid-cols-2 gap-0 border border-zinc-800 rounded-none font-mono text-xs bg-black text-green-400 shadow-2xl mb-0"
                  style={{
                    minWidth: "350px",
                    boxShadow: "0 0 40px #101e1b88",
                    border: "3px double #00FF55",
                    opacity: 0.92,
                  }}
                >
                  <div className="px-4 py-1 font-bold bg-black/90 border-b border-green-700 col-span-2 tracking-wide uppercase">
                    <span className="text-[#00FF55]">stack@PICO:</span>
                    <span className="pl-2 text-green-300">~</span>
                  </div>
                  <div className="px-4 py-1 border-b border-r border-green-800 font-semibold tracking-tighter bg-black/80">
                    Framework
                  </div>
                  <div className="px-4 py-1 border-b border-green-800 bg-black/70">
                    Next.js
                  </div>
                  <div className="px-4 py-1 border-b border-r border-green-800 font-semibold bg-black/80">
                    Styling
                  </div>
                  <div className="px-4 py-1 border-b border-green-800 bg-black/70">
                    Tailwind CSS
                  </div>
                  <div className="px-4 py-1 border-b border-r border-green-800 font-semibold bg-black/80">
                    Database
                  </div>
                  <div className="px-4 py-1 border-b border-green-800 bg-black/70">
                    PostgreSQL
                  </div>
                  <div className="px-4 py-1 border-b border-r border-green-800 font-semibold bg-black/80">
                    Cache
                  </div>
                  <div className="px-4 py-1 border-b border-green-800 bg-black/70">
                    Redis
                  </div>
                  <div className="px-4 py-1 border-b border-r border-green-800 font-semibold bg-black/80">
                    Hardware
                  </div>
                  <div className="px-4 py-1 border-b border-green-800 bg-black/70">
                    Raspberry Pi 4
                  </div>
                  <div className="px-4 py-1 border-b border-r border-green-800 font-semibold bg-black/80">
                    Deployment
                  </div>
                  <div className="px-4 py-1 border-b border-green-800 bg-black/70">
                    Coolify
                  </div>
                  <div className="px-4 py-1 border-b border-r border-green-800 font-semibold bg-black/80">
                    Networking
                  </div>
                  <div className="px-4 py-1 border-b border-green-800 bg-black/70">
                    Tailscale
                  </div>
                  <div className="px-4 py-1 border-r border-green-800 font-semibold bg-black/80">
                    Location
                  </div>
                  <div className="px-4 py-1 bg-black/70">Laundry Room</div>
                </div>
              </div>
            </p>
            <footer className="fixed bottom-0 left-0 w-full bg-black/80 border-t border-green-800 z-50">
              <div className="max-w-3xl mx-auto py-2 px-4">
                <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center">
                  This page has been viewed {views} times.
                </p>
              </div>
            </footer>
          </div>
        </div>
      </main>
    </div>
  );
}
