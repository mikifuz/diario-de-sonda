// Avisos no celular, lado do servidor (só roda nas rotas /api/avisos). Usa as chaves secretas
// das variáveis de ambiente da Vercel; nunca importar isto numa tela.
import webpush from "web-push";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface PushPayload { title: string; body: string; url: string; tag?: string }
export interface PushRow { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }

/** null enquanto faltar alguma chave na Vercel */
export function pushEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!url || !service || !pub || !priv) return null;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const subject = process.env.VAPID_SUBJECT || (host ? `https://${host}` : "mailto:avisos@example.com");
  return { url, service, pub, priv, subject };
}

let vapidSet = false;
export function admin(env: NonNullable<ReturnType<typeof pushEnv>>): SupabaseClient {
  if (!vapidSet) { webpush.setVapidDetails(env.subject, env.pub, env.priv); vapidSet = true; }
  return createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Quem está chamando (pelo login enviado no cabeçalho) */
export async function caller(db: SupabaseClient, req: Request): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await db.auth.getUser(token);
  return data.user?.id ?? null;
}

/** Envia para cada aparelho; aparelhos que o navegador já desligou são apagados. Devolve quantos receberam. */
export async function sendTo(db: SupabaseClient, subs: PushRow[], p: PushPayload): Promise<number> {
  const body = JSON.stringify(p);
  const res = await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 12 * 3600, urgency: "normal" });
      return true;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
      return false;
    }
  }));
  return res.filter(Boolean).length;
}

export const json = (data: unknown, status = 200) => Response.json(data, { status });
export const NOT_CONFIGURED = { ok: false, error: "Os avisos no celular ainda não foram configurados no servidor." };
