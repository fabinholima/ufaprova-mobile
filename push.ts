import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

// Aviso de nota nova (push do Expo). A permissão só é pedida quando o aluno
// toca em "Ativar avisos"; depois disso o aparelho é registrado a cada entrada,
// porque o token pode mudar. Na web não há aviso (push.web.ts).

type Request = <T>(path: string, input?: object) => Promise<T>;
export type PushStatus = "unsupported" | "ask" | "denied" | "on";

// No Android o aviso depende do Firebase (FCM). Enquanto o build não tiver o
// google-services.json, EXPO_PUBLIC_PUSH_ANDROID fica desligado e o cartão
// "Ativar avisos" não aparece.
export const PUSH_SUPPORTED =
  Platform.OS === "ios" || (Platform.OS === "android" && process.env.EXPO_PUBLIC_PUSH_ANDROID === "on");

// Com o aplicativo aberto, o aviso aparece no topo e a lista é atualizada.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function channel() {
  // Android 13+: o canal precisa existir antes do pedido de permissão.
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("grades", {
      name: "Notas publicadas",
      importance: Notifications.AndroidImportance.HIGH,
    });
}

export async function pushStatus(): Promise<PushStatus> {
  if (!PUSH_SUPPORTED) return "unsupported";
  const permission = await Notifications.getPermissionsAsync();
  if (permission.granted) return "on";
  return permission.canAskAgain ? "ask" : "denied";
}

async function register(request: Request) {
  const { data: token } = await Notifications.getExpoPushTokenAsync();
  await request("/api/push/devices", { token, platform: Platform.OS });
  return token;
}

// Sem pedir permissão: só registra se o aluno já tiver aceitado.
export async function syncPush(request: Request): Promise<PushStatus> {
  const status = await pushStatus();
  if (status === "on") {
    await channel();
    await register(request);
  }
  return status;
}

export async function enablePush(request: Request): Promise<PushStatus> {
  if (!PUSH_SUPPORTED) return "unsupported";
  await channel();
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return permission.canAskAgain ? "ask" : "denied";
  await register(request);
  return "on";
}

// Ao sair: este aparelho deixa de receber avisos desta conta.
export async function disablePush(request: Request) {
  if ((await pushStatus()) !== "on") return;
  const { data: token } = await Notifications.getExpoPushTokenAsync();
  await request("/api/push/devices/remove", { token });
}

const resultOf = (response: Notifications.NotificationResponse | null) => {
  const data = response?.notification.request.content.data as { type?: unknown; resultId?: unknown } | undefined;
  return data?.type === "result" && typeof data.resultId === "string" ? data.resultId : null;
};

// Toque no aviso, com o aplicativo aberto ou ao abri-lo pelo aviso.
export function onResultOpened(callback: (resultId: string) => void): () => void {
  if (!PUSH_SUPPORTED) return () => {};
  let active = true;
  void Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      const id = resultOf(response);
      if (active && id) {
        void Notifications.clearLastNotificationResponseAsync().catch(() => {});
        callback(id);
      }
    })
    .catch(() => {});
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const id = resultOf(response);
    if (id) callback(id);
  });
  return () => {
    active = false;
    subscription.remove();
  };
}
