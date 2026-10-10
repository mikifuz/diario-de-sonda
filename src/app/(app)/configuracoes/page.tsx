"use client";
import { useRef, useState, type FormEvent } from "react";
import { useStore, type Table } from "@/lib/store";
import { useRoom } from "@/lib/room";
import { sb, friendlyError } from "@/lib/supabase";
import { parseNum, todayKey } from "@/lib/calc";
import { SKINS } from "@/lib/constants";
import { convertLegacy, isLegacyExport } from "@/lib/legacy";
import type { Profile, Skin } from "@/lib/types";
import { ConfirmButton, I, Icon } from "@/components/ui";

const ORDER: Table[] = ["subjects", "topics", "assessments", "study_sessions", "events"];

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
    const payload = { app: "diario-de-sonda", version: 2, exportedAt: new Date().toISOString(), profile: { ...p, timer: null }, subjects: st.subjects, topics: st.topics, sessions: st.sessions, assessments: st.assessments, events: st.events };
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
        rows = { subjects: r.subjects, topics: r.topics, assessments: r.assessments, study_sessions: r.sessions, events: r.events };
        skipped = r.skipped;
        for (const [k, v] of Object.entries(r.profile)) if (v !== undefined && v !== null && v !== "") prof[k] = v;
        if (prof.skin && !SKINS.some((s) => s.id === prof.skin)) delete prof.skin;
      } else if (j && j.app === "diario-de-sonda" && j.version === 2) {
        rows = { subjects: j.subjects || [], topics: j.topics || [], assessments: j.assessments || [], study_sessions: j.sessions || [], events: j.events || [] };
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
      st.toast(`${n} registros importados${skipped ? `; ${skipped} ignorado(s) por estarem incompletos` : ""}.`);
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
      for (const t of ["events", "subjects"] as const) {
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
      <section className="panel">
        <div className="panel-h"><h2>Seus dados</h2><span className="lbl">{st.subjects.length} disciplinas, {st.sessions.length} sessões, {st.assessments.length + st.events.length} itens de calendário</span></div>
        <div className="stack">
          <p className="small" style={{ margin: 0 }}>Seus registros acadêmicos são privados: nenhuma outra conta consegue lê-los. Na sala de estudos aparecem só o apelido, a presença e os minutos por dia.</p>
          <div className="row">
            <button className="btn" onClick={exportData} disabled={!!busy}>Exportar cópia (JSON)</button>
            <button className="btn" onClick={() => fileRef.current?.click()} disabled={!!busy}>Importar cópia</button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) importFile(file); }} />
            {busy && <span className="small muted">{busy}</span>}
          </div>
          <p className="small muted" style={{ margin: 0 }}>A importação aceita a cópia exportada desta versão e a da primeira versão (a página publicada no Claude, em Configurações → Exportar cópia). Importar duas vezes a cópia antiga duplica os registros.</p>
          <div className="row" style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 4 }}>
            <ConfirmButton small label="Apagar todos os meus dados" question="Isto apaga disciplinas, sessões, notas e eventos. Exporte uma cópia antes se quiser guardar." confirmLabel="Apagar tudo" onConfirm={wipe} />
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-h"><h2>Conta</h2></div>
        <div className="row between">
          <span className="small">Conectado como <b>{st.email}</b></span>
          <button className="btn" onClick={async () => { const { error } = await sb().auth.signOut(); if (error) st.toast(friendlyError(error)); }}><Icon d={I.logout} s={15} />Sair</button>
        </div>
      </section>
      <section className="panel">
        <div className="panel-h"><h2>Próximas etapas</h2><span className="lbl">ainda não disponíveis</span></div>
        <div className="grid g2 small">
          <div><b>Análise de desempenho</b><p className="muted" style={{ margin: ".3em 0 0" }}>Índice de domínio por conteúdo com metodologia explicada, banco de erros com categorias, revisão espaçada, planejamento reverso para provas e relatórios.</p></div>
          <div><b>Inteligência artificial</b><p className="muted" style={{ margin: ".3em 0 0" }}>Gerador de simulados com gabarito e resolução, correção assistida de resoluções enviadas por foto e assistente que consulta seus dados.</p></div>
          <div><b>Engenharia de Petróleo</b><p className="muted" style={{ margin: ".3em 0 0" }}>Biblioteca de fórmulas com unidades, conversor SI ↔ unidades de campo (bbl, psi, ft, mD, cP, °API), verificação dimensional e histórico da graduação.</p></div>
          <div><b>Biblioteca de materiais</b><p className="muted" style={{ margin: ".3em 0 0" }}>Planos de ensino, listas e provas antigas por disciplina, que depois servirão de base para os simulados.</p></div>
        </div>
      </section>
    </>
  );
}
