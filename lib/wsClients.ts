import { WebSocket } from "ws";

export const clients = new Map<string, WebSocket>();
