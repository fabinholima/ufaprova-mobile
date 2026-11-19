// Na web (PWA) não há aviso de nota: o push do Expo é só para o aplicativo.
export type PushStatus = "unsupported" | "ask" | "denied" | "on";
export const PUSH_SUPPORTED = false;
export async function pushStatus(): Promise<PushStatus> {
  return "unsupported";
}
export async function syncPush(): Promise<PushStatus> {
  return "unsupported";
}
export async function enablePush(): Promise<PushStatus> {
  return "unsupported";
}
export async function disablePush() {}
export function onResultOpened(): () => void {
  return () => {};
}
