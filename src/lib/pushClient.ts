// Avisos no celular, lado do aparelho: registra o service worker, pede permissão, guarda a
// inscrição em push_subscriptions e pede ao servidor para enviar. Nada aqui envia sozinho.
import { sb } from "./supabase";

export const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

export type PushSupport = "ok" | "sem_servidor" | "sem_suporte" | "iphone_tela" | "bloqueado";

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** O que impede (ou não) de ativar avisos neste aparelho */
export function pushSupport(): PushSupport {
  if (!VAPID_PUBLIC) return "sem_servidor";
  // no iPhone o aviso só existe com o app adicionado à Tela de Início
  if (isIOS() && !standalone()) return "iphone_tela";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "sem_suporte";
  if (Notification.permission === "denied") return "bloqueado";
  return "ok";
}

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function deviceName(): string {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua) ? "Android" : isIOS() ? "iPhone/iPad" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Aparelho";
  const br = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "navegador";
  return `${os} · ${br}`;
}

/** Inscrição deste aparelho no navegador (null = não ativado aqui) */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Grava (ou atualiza) a inscrição no banco sem mexer nas preferências já escolhidas */
export async function saveSubscription(sub: PushSubscription) {
  const j = sub.toJSON();
  return sb().from("push_subscriptions").upsert(
    { endpoint: sub.endpoint, p256dh: j.keys?.p256dh ?? "", auth: j.keys?.auth ?? "", device: deviceName() },
    { onConflict: "user_id,endpoint" },
  );
}

/** Pede permissão, inscreve o aparelho e grava. Devolve a mensagem de erro ou null. */
export async function enablePush(): Promise<string | null> {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return "Sem permissão para mostrar avisos. Libere nas configurações do navegador e tente de novo.";
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) }));
  const { error } = await saveSubscription(sub);
  return error ? error.message : null;
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await sb().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}

/** Chama uma rota de avisos do servidor com o login atual */
export async function callPush(path: "teste" | "amigos", body?: unknown): Promise<{ ok: boolean; sent?: number; error?: string }> {
  const { data } = await sb().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: "Sessão expirada. Entre de novo." };
  const r = await fetch(`/api/avisos/${path}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  return r.json().catch(() => ({ ok: false, error: "Resposta inválida do servidor." }));
}

/** Depois de um pedido de amizade ou chamado: avisa no celular da outra pessoa (se ela ativou) */
export function flushPush() {
  if (!VAPID_PUBLIC) return;
  callPush("amigos").catch(() => { /* o aviso no app continua valendo */ });
}
