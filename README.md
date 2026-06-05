# picopi

Simple connected toys built from a single action — turn a knob, press a button, flip a switch.

Each toy is a small wooden box with one big, satisfying control on top. WiFi-enabled ESP32 modules handle the electronics; this repo is the web app and backend that ties them together.

## Origin

Picopi started as a sandbox — a place to explore modern Next.js with Server Actions and React Server Components, and to figure out how to self-host the whole stack on a Raspberry Pi.

From there it grew into something much more physical. ESP32 modules, custom PCBs, woodworking, product design — all in service of one goal: building meaningful connected experiences for kids. Not apps on screens, but real objects with weight and texture that do one thing well.

**sh0rtwave** is the one that struck a chord. A little answering machine for voice messages between kids and the people who love them. Press the button, leave a message. When the light blinks, someone left one for you. The recordings pile up over time into a collection of audio I'll cherish forever.

## Toys

| Route           | Toy              | Action        | What it does                                                       |
| --------------- | ---------------- | ------------- | ------------------------------------------------------------------ |
| `/shortwave`    | **sh0rtwave**    | Push a button | Trade voice messages — no screens attached                         |
| `/toggle`       | **toggle**       | Flip a switch | Keep two toggles in sync from afar; compete on the leaderboard     |
| `/hidden-radio` | **hidden radio** | Turn a knob   | Discover what's hiding in the FM spectrum off the usual radio dial |

Firmware for each device lives under `esp32/`.

## Core technologies

### Web app

- **[Next.js 16](https://nextjs.org)** — App Router, React Server Components, and Server Actions
- **[React 19](https://react.dev)**
- **[TypeScript](https://www.typescriptlang.org)**
- **[Tailwind CSS 4](https://tailwindcss.com)**
- **[Motion](https://motion.dev)** — UI animations

### Backend & data

- **[PostgreSQL](https://www.postgresql.org)** with **[Drizzle ORM](https://orm.drizzle.team)** — devices, recordings, users, toggle groups, and more
- **[Redis](https://redis.io)** — pub/sub for routing real-time commands to connected clients
- **Custom Node server** (`server.ts`) — Next.js request handler plus a WebSocket server for live device communication
- **[Auth.js / NextAuth](https://authjs.dev)** — Google sign-in and session management
- **[Zod](https://zod.dev)** — runtime validation for API payloads and WebSocket messages
- **ffmpeg** — audio transcoding and processing (recordings, answering-machine playback)
- **[Sharp](https://sharp.pixelplumbing.com)** + **[Tesseract.js](https://tesseract.projectnaptha.com)** — image preprocessing and OCR (e.g. inbound mail parsing) for display on my TRMNL

### Hardware

- **[ESP32](https://www.espressif.com/en/products/socs/esp32)** (ESP32-S3) — WiFi, I2S audio, OTA firmware updates
- **Arduino / C++** firmware in `esp32/shortwave`, `esp32/toggle`, and `esp32/knob`
- **KiCad** PCB designs (e.g. `esp32/shortwave/sh0rtwave_pcb/`)

### Infrastructure & hosting

The whole stack runs self-hosted on a **Raspberry Pi**, deployed and managed through **[Coolify](https://coolify.io)**. The app ships as a **Docker** image (multi-stage build; production image includes `ffmpeg`).

| Layer           | Tool                                                                                                 | Role                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Compute         | Raspberry Pi + Coolify                                                                               | Self-hosted app platform                                                   |
| Containers      | Docker                                                                                               | Build, ship, and run the Next.js app + custom server                       |
| Database        | PostgreSQL                                                                                           | Primary data store (devices, recordings, users, toggle groups)             |
| Cache / pub-sub | Redis                                                                                                | Real-time command routing to WebSocket clients                             |
| Private network | [Tailscale](https://tailscale.com)                                                                   | Secure mesh VPN — access the Pi and services without exposing ports        |
| Public ingress  | [Cloudflare Tunnels](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) | Expose the app to the internet (and ESP32 devices) without port forwarding |

### Integrations

- **Web Push** — notifications when new messages arrive
- **Gmail API** — inbound message processing
- **Telegram** — device channel integration
- **Google OAuth** — sign-in and API access

## Project structure

```
app/           Next.js pages, components, server actions, and API routes
db/            Drizzle schema and database client
esp32/         Device firmware and PCB files
lib/           Shared utilities (auth, redis, websocket, push, etc.)
scripts/       CLI helpers (Gmail auth, token generation, DB seeding)
server.ts      Custom HTTP + WebSocket server for production
drizzle/       Database migrations
public/        Static assets and OTA firmware binaries
```

## Getting started

### Prerequisites

- Node.js 20+
- PostgreSQL
- Redis

### Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production build

In production the app runs on a Raspberry Pi via Coolify, behind a Cloudflare Tunnel, with PostgreSQL and Redis as managed services on the same host.

```bash
npm run build          # Next.js build
npm run build:server   # Bundle custom server
npm run build:release  # Build + run with .env.local
```

Or build the Docker image directly:

```bash
docker build -t picopi .
docker run -p 3000:3000 picopi
```

### Environment

Copy and configure environment variables for your local setup (database URL, Redis, auth secrets, API keys). See `.env.local` and the `env.h.example` files under `esp32/` for device-side credentials.

### Database

```bash
npx drizzle-kit migrate
```

## License

Private — not open source.
