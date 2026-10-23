import { HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { API_URL, freshAccessToken } from '../api/client';

let connection: ReturnType<HubConnectionBuilder['build']> | null = null;
let starting: Promise<void> | null = null;
let callConnection: ReturnType<HubConnectionBuilder['build']> | null = null;
let startingCalls: Promise<void> | null = null;
const reconnectListeners = new Set<() => void>();
export function onMessagesReconnected(listener: () => void) {
  reconnectListeners.add(listener);
  return () => { reconnectListeners.delete(listener); };
}
export async function connectMessages() {
  if (connection?.state === HubConnectionState.Connected) return connection;
  if (!connection) {
    connection = new HubConnectionBuilder().withUrl(`${API_URL}/hubs/messages`, { accessTokenFactory: async () => (await freshAccessToken()) || '' }).withAutomaticReconnect([0, 2000, 5000, 10000, 30000]).configureLogging(LogLevel.Error).build();
    connection.onreconnected(() => reconnectListeners.forEach(listener => listener()));
  }
  if (connection.state === HubConnectionState.Reconnecting) return connection;
  const current = connection;
  if (!starting && current.state === HubConnectionState.Disconnected) {
    const task = current.start().finally(() => { if (starting === task) starting = null; });
    starting = task;
  }
  // Keep the instance so screens can register handlers while offline. A
  // foreground refresh starts this same connection again.
  try { await starting; } catch { return current; }
  return current;
}
export async function stopMessages() { const current = connection; connection = null; starting = null; if (current) await current.stop().catch(() => {}); }
export function getMessageHub() { return connection; }
export async function connectCalls() {
  if (callConnection?.state === HubConnectionState.Connected) return callConnection;
  if (!callConnection) callConnection = new HubConnectionBuilder().withUrl(`${API_URL}/hubs/calls`, { accessTokenFactory: async () => (await freshAccessToken()) || '' }).withAutomaticReconnect([0, 2000, 5000, 10000, 30000]).configureLogging(LogLevel.Error).build();
  if (callConnection.state === HubConnectionState.Reconnecting) return callConnection;
  const current = callConnection;
  if (!startingCalls && current.state === HubConnectionState.Disconnected) {
    const task = current.start().finally(() => { if (startingCalls === task) startingCalls = null; });
    startingCalls = task;
  }
  try { await startingCalls; return current; } catch { return current; }
}
export async function stopCalls() { const current = callConnection; callConnection = null; startingCalls = null; if (current) await current.stop().catch(() => {}); }

