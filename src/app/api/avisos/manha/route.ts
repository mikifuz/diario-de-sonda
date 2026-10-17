// Resumo da manhã: a Vercel chama esta rota uma vez por dia (vercel.json, 10h UTC = 7h em
// Brasília) com o CRON_SECRET. Para cada pessoa com o resumo ligado em algum aparelho, junta
// provas próximas e tarefas do dia (morningDigest); sem nada a dizer, não manda.
import { admin, json, NOT_CONFIGURED, pushEnv, sendTo, type PushRow } from "@/lib/pushServer";
import { brDay, morningDigest } from "@/lib/digest";
import type { Assessment } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return json({ ok: false }, 401);
  const env = pushEnv();
  if (!env) return json(NOT_CONFIGURED, 503);
  const db = admin(env);
  const { data: subs, error } = await db.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth").eq("manha", true);
  if (error) return json({ ok: false, error: error.message }, 500);
  const byUser = new Map<string, PushRow[]>();
  for (const s of (subs ?? []) as PushRow[]) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  const today = brDay();
  let users = 0, sent = 0;
  for (const [uid, list] of byUser) {
    const [subjects, assessments, todos, last] = await Promise.all([
      db.from("subjects").select("id,name,archived").eq("user_id", uid),
      db.from("assessments").select("id,subject_id,name,kind,date,grade,status").eq("user_id", uid),
      db.from("tasks").select("done,due").eq("user_id", uid).eq("done", false).not("due", "is", null),
      db.from("study_sessions").select("started_at").eq("user_id", uid).order("started_at", { ascending: false }).limit(1),
    ]);
    if (subjects.error || assessments.error || todos.error || last.error) continue;
    const d = morningDigest({
      today, subjects: subjects.data, assessments: assessments.data as Assessment[], todos: todos.data,
      lastStudy: last.data[0] ? brDay(last.data[0].started_at) : null,
    });
    if (!d) continue;
    users++;
    sent += await sendTo(db, list, { ...d, tag: `manha-${today}` });
  }
  return json({ ok: true, today, users, sent });
}
