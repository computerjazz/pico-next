import ViewCounter from "./components/ViewCounter";

export default function Home() {
  return (
    <div className="crt-root min-h-screen bg-black font-mono text-green-300 selection:bg-green-400/30 selection:text-green-100">
      <div className="crt-bg" aria-hidden="true" />

      <main className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center px-6 py-24 sm:px-10">
        <section className="crt-window w-full">
          <header className="crt-titlebar">
            <div className="crt-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="crt-title">PICO TERMINAL</div>
            <div className="crt-status" suppressHydrationWarning>
              <span className="crt-prompt">pico@laundry</span>
              <span className="crt-path">:~</span>
            </div>
          </header>

          <div className="crt-body">
            <h1 className="crt-h1">PICOPI.CC</h1>
            <p className="crt-sub">
              A tiny next.js app running on a Raspberry Pi in the laundry room.
            </p>

            <div className="mt-8 w-full flex justify-center sm:justify-start">
              <div
                className="grid grid-cols-2 gap-0 rounded-none text-xs bg-black/60 text-green-300"
                style={{
                  minWidth: "350px",
                  boxShadow: "0 0 40px rgba(0, 255, 85, 0.12)",
                  border: "3px double rgba(0, 255, 85, 0.85)",
                  opacity: 0.95,
                }}
              >
                <div className="px-4 py-1 font-bold bg-black/80 border-b border-green-700/70 col-span-2 tracking-wide uppercase">
                  <span className="text-[#00FF55]">stack@PICO:</span>
                  <span className="pl-2 text-green-200">~</span>
                </div>
                <div className="px-4 py-1 border-b border-r border-green-800/60 font-semibold tracking-tighter bg-black/60">
                  Framework
                </div>
                <div className="px-4 py-1 border-b border-green-800/60 bg-black/40">
                  Next.js
                </div>
                <div className="px-4 py-1 border-b border-r border-green-800/60 font-semibold bg-black/60">
                  Styling
                </div>
                <div className="px-4 py-1 border-b border-green-800/60 bg-black/40">
                  Tailwind CSS
                </div>
                <div className="px-4 py-1 border-b border-r border-green-800/60 font-semibold bg-black/60">
                  Database
                </div>
                <div className="px-4 py-1 border-b border-green-800/60 bg-black/40">
                  PostgreSQL
                </div>
                <div className="px-4 py-1 border-b border-r border-green-800/60 font-semibold bg-black/60">
                  Cache
                </div>
                <div className="px-4 py-1 border-b border-green-800/60 bg-black/40">
                  Redis
                </div>
                <div className="px-4 py-1 border-b border-r border-green-800/60 font-semibold bg-black/60">
                  Hardware
                </div>
                <div className="px-4 py-1 border-b border-green-800/60 bg-black/40">
                  Raspberry Pi 4
                </div>
                <div className="px-4 py-1 border-b border-r border-green-800/60 font-semibold bg-black/60">
                  Deployment
                </div>
                <div className="px-4 py-1 border-b border-green-800/60 bg-black/40">
                  Coolify
                </div>
                <div className="px-4 py-1 border-b border-r border-green-800/60 font-semibold bg-black/60">
                  Networking
                </div>
                <div className="px-4 py-1 border-b border-green-800/60 bg-black/40">
                  Tailscale
                </div>
                <div className="px-4 py-1 border-r border-green-800/60 font-semibold bg-black/60">
                  Location
                </div>
                <div className="px-4 py-1 bg-black/40">Laundry Room</div>
              </div>
            </div>

            <div className="mt-10 text-center sm:text-left">
              <div className="crt-line">
                <span className="crt-prompt">$</span>
                <span className="crt-cmd"> uptime</span>
              </div>
            </div>
          </div>
        </section>

        <footer className="pointer-events-none fixed bottom-0 left-0 w-full px-4 py-3">
          <ViewCounter />
        </footer>
      </main>

      <style>{`
        .crt-root {
          text-shadow: 0 0 10px rgba(0, 255, 85, 0.15);
        }

        .crt-bg {
          position: fixed;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(
              1200px 800px at 50% 20%,
              rgba(0, 255, 85, 0.08),
              transparent 60%
            ),
            radial-gradient(
              900px 700px at 50% 80%,
              rgba(0, 255, 85, 0.05),
              transparent 55%
            ),
            linear-gradient(to bottom, rgba(0, 0, 0, 0.2), rgba(0, 0, 0, 0.65));
        }

        .crt-bg::before {
          content: "";
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            to bottom,
            rgba(0, 0, 0, 0.35),
            rgba(0, 0, 0, 0.35) 1px,
            rgba(255, 255, 255, 0.02) 2px,
            rgba(0, 0, 0, 0.12) 4px
          );
          opacity: 0.45;
          mix-blend-mode: overlay;
        }

        .crt-bg::after {
          content: "";
          position: absolute;
          inset: -2px;
          background: radial-gradient(
            900px 700px at 50% 50%,
            transparent 55%,
            rgba(0, 0, 0, 0.65) 78%,
            rgba(0, 0, 0, 0.85) 100%
          );
          filter: blur(0.2px);
        }

        .crt-window {
          position: relative;
          border: 2px solid rgba(0, 255, 85, 0.55);
          box-shadow:
            0 0 0 1px rgba(0, 255, 85, 0.18),
            0 20px 80px rgba(0, 0, 0, 0.6),
            0 0 60px rgba(0, 255, 85, 0.08);
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(6px);
        }

        .crt-window::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(
            115deg,
            rgba(255, 255, 255, 0.05),
            transparent 28%,
            transparent 60%,
            rgba(255, 255, 255, 0.03) 85%,
            transparent
          );
          opacity: 0.35;
        }

        .crt-titlebar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 12px;
          border-bottom: 1px solid rgba(0, 255, 85, 0.35);
          background: rgba(0, 0, 0, 0.65);
        }

        .crt-dots {
          display: flex;
          gap: 7px;
        }

        .crt-dots > span {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: rgba(0, 255, 85, 0.25);
          box-shadow: 0 0 12px rgba(0, 255, 85, 0.18);
        }

        .crt-title {
          flex: 1;
          text-align: center;
          letter-spacing: 0.18em;
          font-size: 11px;
          color: rgba(188, 255, 214, 0.8);
          text-transform: uppercase;
          user-select: none;
        }

        .crt-status {
          font-size: 11px;
          color: rgba(188, 255, 214, 0.75);
          white-space: nowrap;
        }

        .crt-body {
          padding: 22px 18px 26px;
        }

        .crt-h1 {
          font-size: 28px;
          line-height: 1.15;
          letter-spacing: 0.06em;
          color: rgba(188, 255, 214, 0.95);
          text-transform: uppercase;
        }

        .crt-sub {
          margin-top: 10px;
          font-size: 13px;
          line-height: 1.6;
          color: rgba(0, 255, 85, 0.6);
          max-width: 52ch;
        }

        .crt-line {
          font-size: 12px;
          color: rgba(188, 255, 214, 0.8);
        }

        .crt-prompt {
          color: rgba(0, 255, 85, 0.95);
        }

        .crt-path {
          color: rgba(188, 255, 214, 0.75);
        }

        .crt-cmd {
          color: rgba(188, 255, 214, 0.92);
        }

        .crt-out {
          margin-top: 6px;
          font-size: 12px;
          color: rgba(188, 255, 214, 0.75);
        }

        @media (prefers-reduced-motion: no-preference) {
          .crt-window {
            animation: crt-flicker 6.5s infinite;
          }

          @keyframes crt-flicker {
            0%,
            100% {
              filter: saturate(1) contrast(1);
            }
            48% {
              filter: saturate(1.02) contrast(1.03);
            }
            50% {
              filter: saturate(0.98) contrast(1.02);
            }
            52% {
              filter: saturate(1.03) contrast(1.04);
            }
          }
        }
      `}</style>
    </div>
  );
}
