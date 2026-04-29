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
      socket.send(command);
    } else {
      console.warn(`Client ${targetId} not connected`);
    }
  });

  await app.prepare();

  const server = createServer((req, res) => {
    handle(req, res, parse(req.url!, true));
  });

  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (socket: WebSocket) => {
    let clientId: string | null = null;

    socket.on("message", async (data: Buffer) => {
      const msg = JSON.parse(data.toString());
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

    socket.on("close", () => {
      if (clientId) {
        clients.delete(clientId);
        console.log(`Client disconnected: ${clientId}`);
      }
    });

    socket.on("error", (err: Error) => {
      console.error(`Socket error (${clientId}):`, err);
    });
  });

  server.on("upgrade", (req, socket, head) => {
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
