import { WebSocket } from "ws";

import z from "zod";

const CommandSchema = z.object({
  targetId: z.string(),
  command: z.string(),
});

export const ClientRegisterSchema = z.object({
  type: z.literal("register"),
  id: z.string(),
  groupId: z.string().optional().nullable(),
  token: z.string(),
});

export const ToggleFlipSwitchSchema = z.object({
  type: z.literal("toggle-flip-switch"),
  deviceId: z.string(),
  state: z.enum(["on", "off"]),
  token: z.string(),
});

type SocketGroup = Map<string, WebSocket>;
const clients = new Map<string, SocketGroup>();

function isSocketGroup(
  socketOrGroup?: WebSocket | SocketGroup,
): socketOrGroup is SocketGroup {
  return !!socketOrGroup && "size" in socketOrGroup;
}

function isTruthy<T>(arg: T | undefined | null): arg is NonNullable<T> {
  return !!arg;
}

export function addClient({
  socket,
  clientId,
  groupId,
}: {
  socket: WebSocket;
  clientId?: string | null;
  groupId?: string | null;
}) {
  const groupKey = groupId || clientId;
  const socketKey = clientId || `${groupId}:${Date.now()}`;

  if (!groupKey) {
    console.log("addClient: no clientId, skip register");
    return;
  }

  const socketGroup = clients.get(groupKey) ?? new Map<string, WebSocket>();
  socketGroup.set(socketKey, socket);
  clients.set(groupKey, socketGroup);
}

export function removeClient({
  socket,
  clientId,
  groupId,
}: {
  socket: WebSocket;
  clientId?: string | null;
  groupId?: string | null;
}) {
  const groupKey = groupId || clientId;
  if (!groupKey || !clientId) {
    console.log("removeClient: cannot remove socket client without clientId");
    return;
  }
  const group = clients.get(groupKey);
  if (!group) {
    console.log("removeClient: no socket found");
    return;
  }

  const cur = group.get(clientId);
  if (cur === socket) {
    group.delete(clientId);
  } else {
    console.log("removeClient: (group) socket mismatch, noop");
  }
}

export function getClients({ targetId }: { targetId?: string | null }) {
  if (!targetId) return [];
  const socketOrGroup = clients.get(targetId);

  const sockets = isSocketGroup(socketOrGroup)
    ? [...socketOrGroup.values()]
    : [];

  return sockets.filter(isTruthy);
}

export function sendMessage({ message }: { message?: string | null }) {
  const parsed = CommandSchema.safeParse(JSON.parse(message ?? ""));
  if (!parsed.success) {
    console.error("sendMessage: parse failed", message);
    return;
  }
  const { targetId, command } = parsed.data;
  getClients({ targetId }).forEach((socket) => {
    if (socket.readyState === WebSocket.OPEN) {
      console.log(`Sending message to target ${targetId}`);
      socket.send(command);
    } else {
      console.warn(
        `Client ${targetId} not connected ${socket.readyState}`,
        socket,
      );
    }
  });
}
