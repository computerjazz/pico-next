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
          <div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              A tiny next.js app running on a Raspberry Pi in the laundry room.
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              This page has been viewed {views} times.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
