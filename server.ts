import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import { getRedis } from "./lib/redis.js";
import { validateTokenDefault } from "./lib/auth.js";

const app = next({ dev: false });
const handle = app.getRequestHandler();

const clients = new Map<string, WebSocket>();

async function main() {
  const subscriber = await getRedis();
  console.log("Redis connected");

  await subscriber.subscribe("ws:commands", (message) => {
    const { targetId, command } = JSON.parse(message);
    const socket = clients.get(targetId);
    if (socket?.readyState === WebSocket.OPEN) {
      console.log(`Sending message to target ${targetId}`);
      socket.send(command);
    } else {
      console.warn(
        `Client ${targetId} not connected ${socket?.readyState}`,
        socket,
      );
    }
  });

  await app.prepare();

  const server = createServer((req, res) => {
    handle(req, res, parse(req.url!, true));
  });

  const wss = new WebSocketServer({ noServer: true });
  const PING_INTERVAL = 30000;

  wss.on("connection", (socket: WebSocket) => {
    let clientId: string | null = null;
    let isAlive = true;

    console.log(`socket connection: ${socket.url}`);
    // Heartbeat
    const pingTimer = setInterval(() => {
      if (!isAlive) {
        console.log(`Ping timeout, closing ${clientId}`);
        socket.terminate();
        return;
      }
      socket.ping();
    }, PING_INTERVAL);

    socket.on("pong", () => {
      isAlive = true;
    });

    socket.on("message", async (data: Buffer) => {
      const msg = JSON.parse(data.toString());
      console.log(`socket message ${msg.id}: ${JSON.stringify(msg)}`);
      if (msg.type === "register") {
        const isValid = await validateTokenDefault(msg.token);
        if (!isValid) {
          console.warn(`Rejected client: ${msg.id} (bad token)`);
          socket.close();
          return;
        }
        clientId = msg.id;
        if (clientId) {
          clients.set(clientId, socket);
          console.log(`Client registered: ${clientId}`);
        }
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
        // Only delete if this socket is still the registered one
        if (clients.get(clientId) === socket) {
          clients.delete(clientId);
          console.log(
            `Client disconnected: ${clientId} (code: ${code}, reason: ${reasonStr})`,
          );
        } else {
          console.log(
            `Stale close for ${clientId} — newer socket already registered, skipping delete`,
          );
        }
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
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
