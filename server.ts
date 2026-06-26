import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import { getRedisSubscriber } from "./lib/redis";
import { validateTokenDefault } from "./lib/auth";
import { cleanupActiveJobs, getIsAnyJobActive } from "./lib/job";
import {
  addClient,
  ClientRegisterSchema,
  removeClient,
  sendMessage,
  ToggleFlipSwitchSchema,
} from "./lib/websocket";

const dev = process.env.NODE_ENV !== "production";
console.log("dev?", dev, process.env.NODE_ENV);
const app = next({ dev });
const handle = app.getRequestHandler();

async function main() {
  const redisSubscriber = await getRedisSubscriber();
  console.log("Redis connected");

  await redisSubscriber.subscribe("ws:commands", (message) => {
    sendMessage({ message });
  });

  await app.prepare();

  const server = createServer((req, res) => {
    handle(req, res, parse(req.url!, true));
  });

  const wss = new WebSocketServer({ noServer: true });
  const PING_INTERVAL = 30000;

  wss.on("connection", (socket: WebSocket) => {
    let clientId: string | undefined | null = null;
    let groupId: string | undefined | null = null;
    let clientToken: string | undefined | null = null;
    let lastPongTime = Date.now();

    console.log(`socket connection: ${socket.url}`);
    // Heartbeat
    const pingTimer = setInterval(() => {
      const isAlive = Date.now() - lastPongTime < 120_000;
      if (!isAlive) {
        console.log(`Ping timeout, closing ${clientId}`);
        socket.terminate();
        return;
      }
      socket.ping();
    }, PING_INTERVAL);

    socket.on("pong", async () => {
      lastPongTime = Date.now();

      if (clientId) {
        const phoneHomeUrl = `${process.env.API_BASE_URL}/api/device/${clientId}/phone-home`;
        await fetch(phoneHomeUrl, {
          method: "POST",
          headers: {
            authorization: `Bearer ${clientToken}`,
          },
        });
      }
    });

    socket.on("message", async (data: Buffer) => {
      const dataStr = data.toString();
      const dataJson = JSON.parse(dataStr);
      const clientRegisterParsed = ClientRegisterSchema.safeParse(dataJson);
      const toggleStateParsed = ToggleFlipSwitchSchema.safeParse(dataJson);
      if (clientRegisterParsed.success) {
        const msg = clientRegisterParsed.data;
        const isValid = await validateTokenDefault(msg.token);
        if (!isValid) {
          console.warn(`Rejected client: ${msg.id} (bad token)`);
          socket.close();
          return;
        }
        clientId = msg.id;
        clientToken = msg.token;
        groupId = msg.groupId;
        addClient({
          socket,
          clientId,
          groupId,
        });
      }
      if (toggleStateParsed.success) {
        const msg = toggleStateParsed.data;
        const isValid = await validateTokenDefault(msg.token);
        if (!isValid) {
          console.warn(`Rejected toggle state: ${msg.deviceId} (bad token)`);
          return;
        }
        const toggleStateUrl = `${process.env.API_BASE_URL}/api/device/${msg.deviceId}`;
        await fetch(toggleStateUrl, {
          method: "POST",
          headers: {
            authorization: `Bearer ${process.env.SERVER_TOKEN}`,
          },
          body: JSON.stringify(msg),
        });
      }
    });

    socket.on("close", (code, reason) => {
      clearInterval(pingTimer);

      let reasonStr = "";
      if (reason instanceof Buffer) {
        // Node.js standard: close reason is a Buffer
        reasonStr = reason.toString();
      } else if (typeof reason === "string") {
        reasonStr = reason;
      }

      if (clientId) {
        removeClient({
          clientId,
          groupId,
          socket,
        });
      } else {
        console.log(
          `Socket closed before registration (code: ${code}, reason: ${reasonStr})`,
        );
      }
    });

    socket.on("error", (err: Error) => {
      console.error(`Socket error (${clientId}):`, err);
    });
  });

  server.on("upgrade", (req, socket, head) => {
    console.log("server upgrade", req.url);
    if (req.url === "/api/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  server.listen(3000, () => console.log("Ready on port 3000"));

  setInterval(async () => {
    const isJobActive = await getIsAnyJobActive();
    // Don't do expensive server work if there's already an expensive job in flight
    if (isJobActive) return;
    try {
      const processNextUrl = `${process.env.API_BASE_URL}/api/recording/process-next`;
      await fetch(processNextUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.SERVER_TOKEN}`,
        },
      });
    } catch (err) {
      console.log("transcribe-next err:", err);
    } finally {
      await cleanupActiveJobs();
    }
  }, 30_000);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
