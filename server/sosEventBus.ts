import type express from 'express';
import { randomUUID } from 'crypto';
import type { SosStreamEvent } from '../src/types/officialAlerts.ts';

interface SseClient {
  id: string;
  organizationId: string;
  res: express.Response;
  heartbeatTimer: NodeJS.Timeout;
}

const clients = new Map<string, SseClient>();

export function registerSosSseClient(
  organizationId: string,
  res: express.Response
): string {
  const clientId = randomUUID();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const connectedEvent: SosStreamEvent = {
    type: 'connected',
    organizationId,
    timestamp: new Date().toISOString(),
  };
  res.write(`event: connected\ndata: ${JSON.stringify(connectedEvent)}\n\n`);

  const heartbeatTimer = setInterval(() => {
    try {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    } catch {
      removeSosSseClient(clientId);
    }
  }, 25000);

  clients.set(clientId, { id: clientId, organizationId, res, heartbeatTimer });
  return clientId;
}

export function removeSosSseClient(clientId: string): void {
  const client = clients.get(clientId);
  if (!client) return;
  clearInterval(client.heartbeatTimer);
  clients.delete(clientId);
}

/**
 * Broadcasts a tenant-scoped SSE event to all connected Command Center clients
 * belonging to the same organizationId.
 */
export function broadcastSosEvent(event: SosStreamEvent): number {
  let deliveredCount = 0;
  const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

  for (const [id, client] of clients.entries()) {
    if (client.organizationId !== event.organizationId) continue;
    try {
      client.res.write(payload);
      deliveredCount += 1;
    } catch {
      removeSosSseClient(id);
    }
  }
  return deliveredCount;
}

export function getActiveSseClientCount(organizationId?: string): number {
  if (!organizationId) return clients.size;
  let count = 0;
  for (const client of clients.values()) {
    if (client.organizationId === organizationId) count += 1;
  }
  return count;
}

export function closeAllSosSseClients(): number {
  let closed = 0;
  for (const client of clients.values()) {
    clearInterval(client.heartbeatTimer);
    try {
      client.res.end();
    } catch {
      // Ignore already-closed stream
    }
    closed += 1;
  }
  clients.clear();
  return closed;
}
