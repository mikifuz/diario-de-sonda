// Aviso de teste: vai só para os aparelhos da própria pessoa (ou só para o aparelho que pediu)
import { admin, caller, json, NOT_CONFIGURED, pushEnv, sendTo, type PushRow } from "@/lib/pushServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const env = pushEnv();
  if (!env) return json(NOT_CONFIGURED, 503);
  const db = admin(env);
  const uid = await caller(db, req);
  if (!uid) return json({ ok: false, error: "Entre na sua conta de novo." }, 401);
  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: unknown };
  let q = db.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth").eq("user_id", uid);
  if (typeof endpoint === "string") q = q.eq("endpoint", endpoint);
  const { data, error } = await q;
  if (error) return json({ ok: false, error: error.message }, 500);
  const sent = await sendTo(db, (data ?? []) as PushRow[], { title: "Aviso de teste", body: "Os avisos do Fundo do Poço estão funcionando neste aparelho.", url: "/configuracoes", tag: "teste" });
  return json({ ok: sent > 0, sent, error: sent ? undefined : "O aviso não chegou a nenhum aparelho. Desative e ative de novo." });
}
