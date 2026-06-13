import { useEffect, useMemo } from "react";
import { generateToken } from "../actions/generateToken";
import { useStableCallback } from "./useStableCallback";

function getRandomSocketClientId({
  groupId = "client",
}: {
  groupId?: string | null;
}) {
  return `${groupId}-${Date.now()}`;
}

export function useSocket({
  onMessage,
  clientId,
  groupId,
}: {
  onMessage?: (msg: MessageEvent<unknown>) => void;
  clientId?: string | null;
  groupId?: string | null;
}) {
  const _onMessage = useStableCallback((msg: MessageEvent<unknown>) =>
    onMessage?.(msg),
  );

  const _clientId = useMemo(
    () => getRandomSocketClientId({ groupId }),
    [groupId],
  );
  clientId = clientId ?? _clientId;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnect: NodeJS.Timeout | null = null;
    let stopped = false;

    function connectSocket() {
      if (stopped) return;
      ws = new WebSocket(
        (location.protocol === "https:" ? "wss://" : "ws://") +
          location.host +
          "/api/ws",
      );

      ws.onopen = async () => {
        const token = await generateToken({ scope: "websocket" });
        ws?.send(
          JSON.stringify({
            type: "register",
            token,
            groupId,
            id: clientId,
          }),
        );
      };

      ws.onmessage = (msg) => {
        console.log("socket message", JSON.stringify(msg));
        _onMessage(msg);
      };

      ws.onclose = () => {
        if (!stopped) {
          reconnect = setTimeout(connectSocket, 2000);
        }
      };

      ws.onerror = () => {
        ws?.close();
      };
    }
    connectSocket();

    return () => {
      stopped = true;
      ws?.close();
      if (reconnect) clearTimeout(reconnect);
    };
  }, [clientId, groupId, _onMessage]);
}
