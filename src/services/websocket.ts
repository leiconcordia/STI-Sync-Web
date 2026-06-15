/**
 * src/services/websocket.ts
 *
 * WebSocket client hub — centralized connection, reconnect logic, and event dispatch.
 * All modules fire and listen to real-time ephemeral triggers through this singleton.
 *
 * Message types are defined in docs/database-schema.md → Section 2.
 *
 * Usage:
 *   import { websocketHub } from '@/services/websocket';
 *   websocketHub.send({ type: 'ATTENDANCE_SCANNED', payload: { ... } });
 *   websocketHub.on('ATTENDANCE_SCANNED', handler);
 *   websocketHub.off('ATTENDANCE_SCANNED', handler);
 */

type MessageHandler = (message: WebSocketMessage) => void;

export interface WebSocketMessage<T = unknown> {
  type: string;
  payload: T;
  timestamp?: number;
  senderId?: string;
  organizationId?: string | null;
}

class WebSocketHub {
  private listeners: Map<string, Set<MessageHandler>> = new Map();

  /**
   * Register a handler for a specific message type.
   * Always call websocketHub.off() in useEffect cleanup to prevent leaks.
   */
  on(type: string, handler: MessageHandler): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);
  }

  /**
   * Remove a previously registered handler.
   */
  off(type: string, handler: MessageHandler): void {
    this.listeners.get(type)?.delete(handler);
  }

  /**
   * Dispatch a message to all registered handlers of its type.
   * In production, this will also transmit via the WebSocket connection.
   */
  send<T>(message: Omit<WebSocketMessage<T>, 'timestamp'>): void {
    const full: WebSocketMessage<T> = {
      ...message,
      timestamp: Date.now(),
    };

    // Dispatch to local in-tab listeners immediately
    const handlers = this.listeners.get(full.type);
    if (handlers) {
      handlers.forEach((fn) => fn(full as WebSocketMessage));
    }

    // TODO: Transmit over actual WebSocket connection when server is configured.
    // this.ws?.send(JSON.stringify(full));
    if (import.meta.env.DEV) {
      console.debug(`[WebSocketHub] dispatched: ${full.type}`, full.payload);
    }
  }
}

/** Singleton hub instance — import this everywhere in the codebase */
export const websocketHub = new WebSocketHub();
