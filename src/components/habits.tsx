"use client";
// Hábitos de hoje: lista de bons hábitos que o aluno marca a cada dia (ex.: pouco tempo no celular).
import { useState, type FormEvent } from "react";
import { useStore } from "@/lib/store";
import { qt, todayKey } from "@/lib/calc";
import { HABIT_IDEAS, habitStats } from "@/lib/habits";
import type { Habit } from "@/lib/types";
import { ConfirmButton, I, Icon } from "./ui";

export function HabitsPanel() {
  const st = useStore();
  const today = todayKey();
  const [name, setName] = useState("");
  const [edit, setEdit] = useState(false);
  const list = st.habits.filter((h) => h.active).sort((a, b) => a.position - b.position);
  const doneToday = list.filter((h) => st.habitChecks.some((c) => c.habit_id === h.id && c.day === today)).length;
  const add = async (n: string) => {
    const v = n.trim().slice(0, 80);
    if (!v) return;
    if (list.some((h) => h.name.toLowerCase() === v.toLowerCase())) { st.toast("Esse hábito já está na lista."); return; }
    const row: Habit = { id: crypto.randomUUID(), name: v, position: Math.max(0, ...st.habits.map((h) => h.position)) + 1, active: true };
    if (await st.save("habits", row)) setName("");
  };
  const submit = (e: FormEvent) => { e.preventDefault(); add(name); };
  const toggle = (h: Habit) => {
    const c = st.habitChecks.find((x) => x.habit_id === h.id && x.day === today);
    if (c) st.remove("habit_checks", c.id);
    else st.save("habit_checks", { id: crypto.randomUUID(), habit_id: h.id, day: today });
  };
  const ideas = HABIT_IDEAS.filter((i) => !list.some((h) => h.name.toLowerCase() === i.toLowerCase()));

  return (
    <section className="panel" aria-label="Hábitos de hoje">
      <div className="panel-h"><h2>Hábitos de hoje</h2>
        <span className="row" style={{ gap: 6 }}>{list.length > 0 && <span className="lbl">{doneToday} de {list.length}</span>}
          {list.length > 0 && <button className="btn sm ghost" onClick={() => setEdit(!edit)}>{edit ? "Pronto" : "Editar"}</button>}</span></div>
      {list.length > 0 && <div className="list">{list.map((h) => {
        const s = habitStats(h.id, st.habitChecks, today);
        return (
          <div key={h.id} className="li">
            {!edit && <input type="checkbox" checked={!!s.today} onChange={() => toggle(h)} aria-label={`${h.name}: ${s.today ? "desmarcar" : "marcar como feito hoje"}`} style={{ width: 18, height: 18, accentColor: "var(--ok)", flex: "none" }} />}
            <div className="grow">
              <div className="t">{h.name}</div>
              <div className="m">{s.week} dos últimos 7 dias{s.streak >= 2 ? ` · ${qt(s.streak, "dia", "dias")} seguidos` : ""}</div>
            </div>
            {edit && <ConfirmButton small label={<Icon d={I.trash} s={14} />} question={`Tirar "${h.name}" da lista? O histórico dele também é apagado.`} confirmLabel="Excluir" onConfirm={() => st.remove("habits", h.id)} />}
          </div>
        );
      })}</div>}
      {(edit || !list.length) && (
        <>
          <form className="row" style={{ flexWrap: "nowrap", marginTop: 8 }} onSubmit={submit}>
            <input type="text" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Novo hábito, ex.: dormi antes da meia-noite" aria-label="Novo hábito" />
            <button className="btn pri icon" aria-label="Adicionar hábito"><Icon d={I.plus} s={16} /></button>
          </form>
          {ideas.length > 0 && <div className="row" style={{ gap: 6, marginTop: 8 }}>
            {ideas.map((i) => <button key={i} type="button" className="chip" style={{ cursor: "pointer", background: "none" }} onClick={() => add(i)}>+ {i}</button>)}
          </div>}
          {!list.length && <p className="small muted" style={{ margin: "8px 0 0" }}>Escolha os hábitos que quer acompanhar e marque a cada dia. Só você vê.</p>}
        </>
      )}
    </section>
  );
}
