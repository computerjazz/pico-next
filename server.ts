import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import { clients } from "./lib/wsClients.js";

const app = next({ dev: false });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res, parse(req.url!, true));
  });

  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (socket: WebSocket) => {
    let clientId: string | null = null;

    socket.on("message", (data: Buffer) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "register") {
        if (msg.token !== process.env.WS_SECRET) {
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
});
