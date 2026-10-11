"use client";
import { useRef, useState, type FormEvent } from "react";
import { useStore, type Table } from "@/lib/store";
import { useRoom } from "@/lib/room";
import { sb, friendlyError } from "@/lib/supabase";
import { parseNum, todayKey, qt } from "@/lib/calc";
import { SKINS } from "@/lib/constants";
import { convertLegacy, isLegacyExport } from "@/lib/legacy";
import type { Profile, Skin } from "@/lib/types";
import { ConfirmButton, I, Icon } from "@/components/ui";
import { DEFAULT_MASTERY, masteryCfg, type MasteryCfg } from "@/lib/mastery";
import { DEMO_FLAG } from "@/lib/demo";

// ordem das chaves estrangeiras: conteúdos apontam para provas, erros para sessões, revisões para erros
const ORDER: Table[] = ["subjects", "assessments", "topics", "study_sessions", "events", "routine_blocks", "mistakes", "review_items", "review_logs", "tasks", "curriculum", "habits", "habit_checks"];
const NONE = { routine_blocks: [], mistakes: [], review_items: [], review_logs: [], tasks: [], notifications: [], curriculum: [], habits: [], habit_checks: [] };

export default function Configuracoes() {
  const st = useStore();
  const room = useRoom();
  const p = st.profile!;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const [f, setF] = useState({ name: p.name, course: p.course, university: p.university, current_semester: p.current_semester, min: String(p.default_min_avg).replace(".", ","), goal: p.weekly_goal_h ? String(p.weekly_goal_h).replace(".", ",") : "" });
  const up = (x: Partial<typeof f>) => setF({ ...f, ...x });

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    const min = parseNum(f.min), goal = parseNum(f.goal);
    if (min == null || min < 0 || min > 10) { st.toast("A média mínima deve estar entre 0 e 10."); return; }
    if (goal != null && goal <= 0) { st.toast("A meta semanal precisa ser maior que zero."); return; }
    if (await st.updateProfile({ name: f.name.trim(), course: f.course.trim(), university: f.university.trim(), current_semester: f.current_semester.trim(), default_min_avg: min, weekly_goal_h: goal })) st.toast("Perfil salvo.");
  };

  const exportData = () => {
    const payload = { app: "diario-de-sonda", version: 2, exportedAt: new Date().toISOString(), profile: { ...p, timer: null }, subjects: st.subjects, topics: st.topics, sessions: st.sessions, assessments: st.assessments, events: st.events,
      routine_blocks: st.blocks, mistakes: st.mistakes, review_items: st.reviews, review_logs: st.reviewLogs, tasks: st.todos, curriculum: st.courses, habits: st.habits, habit_checks: st.habitChecks };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = `diario-de-sonda-${todayKey()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importFile = async (file: File) => {
    setBusy("Importando…");
    try {
      const j = JSON.parse(await file.text());
      let rows: Record<Table, { id: string }[]>, prof: Record<string, unknown> = {}, skipped = 0;
      if (isLegacyExport(j)) {
        const r = convertLegacy(j);
        rows = { subjects: r.subjects, topics: r.topics, assessments: r.assessments, study_sessions: r.sessions, events: r.events, ...NONE };
        skipped = r.skipped;
        for (const [k, v] of Object.entries(r.profile)) if (v !== undefined && v !== null && v !== "") prof[k] = v;
        if (prof.skin && !SKINS.some((s) => s.id === prof.skin)) delete prof.skin;
      } else if (j && j.app === "diario-de-sonda" && j.version === 2) {
        // cópias anteriores a esta versão não têm o modo de recuperação: o exame ligado vira "exame"
        const subjects = (j.subjects || []).map((x: Record<string, unknown>) => (x.recovery ? x : { ...x, recovery: x.exam_enabled ? "exame" : "nenhuma" }));
        rows = {
          subjects, topics: j.topics || [], assessments: j.assessments || [], study_sessions: j.sessions || [], events: j.events || [],
          routine_blocks: j.routine_blocks || [], mistakes: j.mistakes || [], review_items: j.review_items || [], review_logs: j.review_logs || [], tasks: j.tasks || [], notifications: [], curriculum: j.curriculum || [], habits: j.habits || [], habit_checks: j.habit_checks || [],
        };
        const { id: _id, timer: _t, ...rest } = j.profile || {};
        void _id; void _t;
        prof = rest;
      } else {
        st.toast("Este arquivo não é uma cópia do Diário de Sonda.");
        return;
      }
      let n = 0;
      for (const t of ORDER) {
        const list = rows[t];
        for (let i = 0; i < list.length; i += 500) {
          const { error } = await sb().from(t).upsert(list.slice(i, i + 500));
          if (error) throw error;
          n += Math.min(500, list.length - i);
        }
      }
      if (Object.keys(prof).length) await st.updateProfile(prof as Partial<Profile>);
      await st.reload();
      st.toast(`${n} registros importados${skipped ? `; ${qt(skipped, "ignorado", "ignorados")} por estarem incompletos` : ""}.`);
    } catch (e) {
      st.toast(e instanceof SyntaxError ? "Arquivo inválido: não é um JSON." : "Falha na importação: " + friendlyError(e as { message?: string }));
      st.reload();
    } finally {
      setBusy("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const wipe = async () => {
    setBusy("Apagando…");
    try {
      if (room.me) await room.leave();
      for (const t of ["events", "routine_blocks", "tasks", "notifications", "curriculum", "habits", "subjects"] as const) {
        const { error } = await sb().from(t).delete().eq("user_id", st.uid);
        if (error) throw error;
      }
      await st.updateProfile({ timer: null, weekly_goal_h: null });
      await st.reload();
      st.toast("Todos os seus registros foram apagados.");
    } catch (e) {
      st.toast(friendlyError(e as { message?: string }));
    } finally { setBusy(""); }
  };

  return (
    <>
      <section className="panel">
        <div className="panel-h"><h2>Aparência</h2><span className="lbl">tema do diário</span></div>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))" }}>
          {SKINS.map((k) => (
            <button key={k.id} className="skin-card" aria-pressed={p.skin === k.id} onClick={() => st.updateProfile({ skin: k.id as Skin })}>
              <span className="pv" style={{ background: k.c[0] }}>{k.c.slice(1).map((c, i) => <i key={i} style={{ background: c, height: [26, 44, 34][i] }} />)}</span>
              <span className="nm"><b>{k.nm}</b><span className="small muted">{k.d}</span></span>
            </button>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="panel-h"><h2>Perfil e metas</h2></div>
        <form className="fgrid" onSubmit={saveProfile}>
          <label className="f"><span>Seu nome</span><input type="text" value={f.name} onChange={(e) => up({ name: e.target.value })} /></label>
          <label className="f"><span>Curso</span><input type="text" value={f.course} onChange={(e) => up({ course: e.target.value })} /></label>
          <label className="f"><span>Universidade</span><input type="text" value={f.university} onChange={(e) => up({ university: e.target.value })} /></label>
          <label className="f"><span>Semestre atual</span><input type="text" value={f.current_semester} onChange={(e) => up({ current_semester: e.target.value })} placeholder="Ex.: 2026.2" /></label>
          <label className="f"><span>Média mínima padrão para novas disciplinas</span><input type="text" inputMode="decimal" value={f.min} onChange={(e) => up({ min: e.target.value })} /></label>
          <label className="f"><span>Meta semanal de estudo (horas)</span><input type="text" inputMode="decimal" value={f.goal} onChange={(e) => up({ goal: e.target.value })} placeholder="Ex.: 20" /></label>
          <div className="full row"><button className="btn pri">Salvar perfil</button></div>
        </form>
      </section>
      <MasterySettings />
      <section className="panel">
        <div className="panel-h"><h2>Seus dados</h2><span className="lbl">{st.subjects.length} disciplinas, {st.sessions.length} sessões, {st.assessments.length + st.events.length} itens de calendário</span></div>
        <div className="stack">
          <p className="small" style={{ margin: 0 }}>Seus registros acadêmicos são privados: nenhuma outra conta consegue lê-los. Na sala de estudos aparecem só o apelido, a presença e os minutos por dia.</p>
          <div className="row">
            <button className="btn" onClick={exportData} disabled={!!busy}>Exportar cópia (JSON)</button>
            <button className="btn" onClick={() => fileRef.current?.click()} disabled={!!busy || st.demo} title={st.demo ? "Indisponível na demonstração" : undefined}>Importar cópia</button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) importFile(file); }} />
            {busy && <span className="small muted">{busy}</span>}
          </div>
          <p className="small muted" style={{ margin: 0 }}>A importação aceita a cópia exportada desta versão e a da primeira versão (a página publicada no Claude, em Configurações → Exportar cópia). Importar duas vezes a cópia antiga duplica os registros.</p>
          {st.demo && <p className="small" style={{ margin: 0 }}>Na demonstração, importar e apagar ficam desligados: os dados são de exemplo e já somem ao sair.</p>}
          {!st.demo && <div className="row" style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 4 }}>
            <ConfirmButton small label="Apagar todos os meus dados" question="Isto apaga disciplinas, sessões, notas, eventos, rotina, erros, revisões, tarefas, hábitos e a grade do curso. Exporte uma cópia antes se quiser guardar." confirmLabel="Apagar tudo" onConfirm={wipe} />
          </div>}
        </div>
      </section>
      <section className="panel">
        <div className="panel-h"><h2>Conta</h2></div>
        <div className="row between">
          <span className="small">Conectado como <b>{st.email}</b></span>
          {st.demo
            ? <button className="btn" onClick={() => { try { sessionStorage.removeItem(DEMO_FLAG); } catch { /* sem armazenamento */ } window.location.href = "/entrar"; }}><Icon d={I.logout} s={15} />Sair da demonstração</button>
            : <button className="btn" onClick={async () => { const { error } = await sb().auth.signOut(); if (error) st.toast(friendlyError(error)); }}><Icon d={I.logout} s={15} />Sair</button>}
        </div>
        {!st.demo && <DeleteAccount />}
      </section>
    </>
  );
}

/** Exclui a conta e tudo o que é dela (função delete_my_account no banco). Pede para digitar EXCLUIR. */
function DeleteAccount() {
  const st = useStore();
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (e: FormEvent) => {
    e.preventDefault();
    if (word.trim().toUpperCase() !== "EXCLUIR") { st.toast("Digite EXCLUIR para confirmar."); return; }
    setBusy(true);
    const { error } = await sb().rpc("delete_my_account");
    if (error) { st.toast(friendlyError(error)); setBusy(false); return; }
    // a conta já não existe: só limpa a sessão deste aparelho
    await sb().auth.signOut({ scope: "local" }).catch(() => undefined);
    window.location.href = "/entrar?conta=excluida";
  };
  if (!open) return (
    <div className="row" style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 12 }}>
      <button className="btn danger sm" onClick={() => setOpen(true)}>Excluir minha conta</button>
    </div>
  );
  return (
    <form className="stack" style={{ gap: 8, borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 12 }} onSubmit={run}>
      <p className="small" style={{ margin: 0 }}><b>Isto não tem volta.</b> A conta ({st.email}) e tudo o que é dela são apagados para sempre: disciplinas, sessões, notas, calendário, rotina, erros, revisões, tarefas, hábitos, grade do curso, notificações, amizades e a presença na sala. Os grupos que você criou continuam para os colegas, sem você. Se quiser guardar seus dados, use “Exportar cópia” antes.</p>
      <label className="f"><span>Para confirmar, digite EXCLUIR</span><input type="text" value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" /></label>
      <div className="row">
        <button className="btn danger" disabled={busy || word.trim().toUpperCase() !== "EXCLUIR"}>{busy ? "Excluindo…" : "Excluir minha conta para sempre"}</button>
        <button type="button" className="btn ghost" onClick={() => { setOpen(false); setWord(""); }}>Cancelar</button>
      </div>
    </form>
  );
}

const MFIELDS: [keyof MasteryCfg, string, number, number][] = [
  ["w_acc", "Peso do acerto conferido", 0, 100], ["w_auto", "Peso da autonomia", 0, 100], ["w_rec", "Peso da prática recente", 0, 100], ["w_err", "Peso dos erros em aberto", 0, 100],
  ["decay_days", "Dias sem praticar até a prática zerar", 7, 180], ["min_n", "Registros conferidos mínimos para dar nota", 1, 20],
];
function MasterySettings() {
  const st = useStore();
  const cur = masteryCfg(st.profile?.mastery_cfg);
  const [f, setF] = useState<Record<string, string>>(() => Object.fromEntries(MFIELDS.map(([k]) => [k, String(cur[k])])));
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const out: Record<string, number> = {};
    for (const [k, label, min, max] of MFIELDS) {
      const v = parseNum(f[k]);
      if (v == null || v < min || v > max || ((k === "decay_days" || k === "min_n") && !Number.isInteger(v))) { st.toast(`${label}: use um número entre ${min} e ${max}.`); return; }
      out[k] = v;
    }
    if (out.w_acc + out.w_auto + out.w_rec + out.w_err <= 0) { st.toast("Pelo menos um peso precisa ser maior que zero."); return; }
    if (await st.updateProfile({ mastery_cfg: out })) st.toast("Índice de domínio atualizado.");
  };
  const reset = async () => {
    setF(Object.fromEntries(MFIELDS.map(([k]) => [k, String(DEFAULT_MASTERY[k])])));
    if (await st.updateProfile({ mastery_cfg: null })) st.toast("Índice de domínio de volta ao padrão.");
  };
  const W = ["w_acc", "w_auto", "w_rec", "w_err"].reduce((a, k) => a + (parseNum(f[k]) || 0), 0);
  return (
    <section className="panel">
      <div className="panel-h"><h2>Índice de domínio</h2><span className="lbl">como a nota de 0 a 100 de cada conteúdo é calculada</span></div>
      <form className="stack" style={{ gap: 12 }} onSubmit={save}>
        <div className="fgrid">{MFIELDS.map(([k, label, min, max]) => (
          <label key={k} className="f"><span>{label}</span><input type="number" min={min} max={max} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
        ))}</div>
        <p className="small muted" style={{ margin: 0 }}>Os pesos não precisam somar 100: a conta divide pela soma (hoje {W}). A confiança nunca entra no índice. Padrão: acerto 50, autonomia 25, prática 15, erros 10; 30 dias; 3 registros.</p>
        <div className="row"><button className="btn pri">Salvar</button><button type="button" className="btn ghost" onClick={reset}>Restaurar padrão</button></div>
      </form>
    </section>
  );
}
