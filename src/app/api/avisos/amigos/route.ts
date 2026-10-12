// Depois de um pedido de amizade, aceite ou chamado para estudar, o app de quem enviou chama esta
// rota. Ela só repassa notificações que o próprio banco criou (com os limites e bloqueios das
// funções de amizade) nos últimos 15 minutos, cada uma uma vez só (pushed_at).
import { admin, caller, json, NOT_CONFIGURED, pushEnv, sendTo, type PushRow } from "@/lib/pushServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const env = pushEnv();
  if (!env) return json(NOT_CONFIGURED, 503);
  const db = admin(env);
  const uid = await caller(db, req);
  if (!uid) return json({ ok: false, error: "Entre na sua conta de novo." }, 401);
  const { data: notes, error } = await db.from("notifications")
    .update({ pushed_at: new Date().toISOString() })
    .eq("from_user", uid).in("kind", ["amizade", "chamado"]).is("pushed_at", null).is("read_at", null)
    .gte("created_at", new Date(Date.now() - 15 * 60_000).toISOString())
    .select("id,user_id,kind,title");
  if (error) return json({ ok: false, error: error.message }, 500);
  let sent = 0;
  for (const n of notes ?? []) {
    const { data: subs } = await db.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth").eq("user_id", n.user_id).eq("amigos", true);
    if (!subs?.length) continue;
    const chamado = n.kind === "chamado";
    sent += await sendTo(db, subs as PushRow[], { title: n.title, body: chamado ? "Toque para abrir a sala de estudos." : "Toque para ver.", url: chamado ? "/sala" : "/notificacoes", tag: n.id });
  }
  return json({ ok: true, sent });
}
