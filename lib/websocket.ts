import { WebSocket } from "ws";

type SocketGroup = Map<string, WebSocket>;
const clients = new Map<string, WebSocket | SocketGroup>();

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
  if (!clientId) {
    console.log("addClient: no clientId, skip register");
    return;
  }
  if (groupId) {
    const group = clients.get(groupId) ?? new Map<string, WebSocket>();
    if (isSocketGroup(group)) {
      group.set(clientId, socket);
      clients.set(groupId, group);
      console.log(
        `addClient: registered client ${clientId} in group: ${groupId}`,
      );
    }
    // TODO: handle case where single socket is replaced by group?
  } else {
    clients.set(clientId, socket);
    console.log(`addClient: registered client ${clientId}`);
  }
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
  if (!clientId) {
    console.log("removeClient: cannot remove socket client without clientId");
    return;
  }
  const groupOrSocket = clients.get(groupId || clientId);
  if (!groupOrSocket) {
    console.log("removeClient: no socket found");
    return;
  }

  if (isSocketGroup(groupOrSocket)) {
    const group = groupOrSocket;
    const cur = group.get(clientId);
    if (cur === socket) {
      group.delete(clientId);
    } else {
      console.log("removeClient: (group) socket mismatch, noop");
    }
  } else {
    const cur = groupOrSocket;
    if (cur === socket) {
      clients.delete(clientId);
    } else {
      console.log("removeClient: (single) socket mismatch, noop");
    }
  }
}

export function getClients({ targetId }: { targetId?: string | null }) {
  if (!targetId) return [];
  const socketOrGroup = clients.get(targetId);

  const sockets = isSocketGroup(socketOrGroup)
    ? [...socketOrGroup.values()]
    : [socketOrGroup];

  return sockets.filter(isTruthy);
}

export function sendMessage({
  targetId,
  command,
}: {
  targetId?: string | null;
  command?: string | null;
}) {
  if (!targetId || !command) {
    console.error("sendMessage: must have a targetId and command");
    return;
  }
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
