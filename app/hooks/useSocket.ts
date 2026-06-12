import { useEffect } from "react";
import { generateToken } from "../actions/generateToken";
import { useStableCallback } from "./useStableCallback";

export function useSocket({
  onMessage,
  clientId,
  groupId,
}: {
  onMessage?: () => void;
  clientId: string;
  groupId?: string;
}) {
  const _onMessage = useStableCallback(() => onMessage?.());

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

      ws.onmessage = (_msg) => {
        console.log("socket message", JSON.stringify(_msg));
        _onMessage();
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
      if (ws) ws.close();
      if (reconnect) clearTimeout(reconnect);
    };
  }, [clientId, groupId, _onMessage]);
}
