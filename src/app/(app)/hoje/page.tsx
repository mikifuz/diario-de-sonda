"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { activeSubjects, agenda, topicName, useStore } from "@/lib/store";
import { addDays, daysBetween, fmtMin, gradeCalc, keyDate, nf, todayKey, qt } from "@/lib/calc";
import { cleanSteps, dm, firstDue, fromMin, itemState, planDay, type PlanInput, type Task } from "@/lib/plan";
import { MISTAKE, PREF, WD_S } from "@/lib/constants";
import { BAND, masteryCfg } from "@/lib/mastery";
import { FINAL_MIN, RESERVE, TARGET, reversePlan, todayTasks, type ExamPlan } from "@/lib/reverse";
import type { Activity, EventType, MistakeCategory, ReviewItem } from "@/lib/types";
import { Dot, Empty, I, Icon, Tabs, useNow } from "@/components/ui";
import { MistakeModal, ReviewItemModal, ReviewModal } from "@/components/planning";
import { ImportSigaModal } from "@/components/importSiga";
import { DayPrint } from "@/components/dayPrint";
import { mistakeCats } from "@/lib/mistakes";
import { easyReminders } from "@/lib/effort";
import { WeekPrint } from "@/components/weekPrint";
import { StartModal, type StartArgs } from "@/components/studyStart";
import { EventModal } from "@/components/modals";
import { GettingStarted } from "@/components/onboarding";
import { dayCards, firstName, greeting, motto, type DayCard } from "@/lib/today";
import { TripsPanel } from "@/components/trips";

type Tab = "plano" | "provas" | "revisar";
const TABS: [Tab, string][] = [["plano", "Plano do dia"], ["provas", "Provas"], ["revisar", "Revisar"]];
// links antigos (?aba=revisoes, ?aba=erros) abrem a aba Revisar
const OLD: Record<string, Tab> = { revisoes: "revisar", erros: "revisar" };
type ModalState = null | { k: "review"; id: string } | { k: "item"; id: string | null } | { k: "mistake"; id: string | null } | { k: "siga" } | { k: "start"; args: StartArgs } | { k: "event"; id: string | null; type?: EventType };
type Open = (m: ModalState) => void;

export default function HojePage() {
  return <Suspense fallback={null}><Hoje /></Suspense>;
}

function Hoje() {
  const params = useSearchParams();
  const router = useRouter();
  const aba = params.get("aba") || "";
  const pre = (OLD[aba] || aba) as Tab;
  const [tab, setTab] = useState<Tab>(TABS.some(([k]) => k === pre) ? pre : "plano");
  const [modal, setModal] = useState<ModalState>(null);
  // a rotina semanal mudou para o Calendário: links antigos (?aba=rotina, &abrir=siga) vão para lá
  const toRoutine = aba === "rotina" || params.get("abrir") === "siga";
  useEffect(() => { if (toRoutine) router.replace(params.get("abrir") === "siga" ? "/calendario?abrir=siga#rotina" : "/calendario#rotina"); }, [toRoutine]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => setModal(null);
  if (toRoutine) return null;
  return (
    <>
      <Greeting />
      <GettingStarted />
      <Tabs value={tab} onChange={setTab} label="Seções" options={TABS} />
      {tab === "plano" && <PlanTab open={setModal} goRoutine={() => router.push("/calendario#rotina")} goExams={() => setTab("provas")} />}
      {tab === "revisar" && <><ReviewsTab open={setModal} /><MistakesTab open={setModal} /></>}
      {tab === "provas" && <ExamsTab open={setModal} />}
      {modal?.k === "review" && <ReviewModal id={modal.id} onClose={close} />}
      {modal?.k === "item" && <ReviewItemModal id={modal.id} onClose={close} />}
      {modal?.k === "mistake" && <MistakeModal id={modal.id} onClose={close} />}
      {modal?.k === "siga" && <ImportSigaModal onClose={close} />}
      {modal?.k === "start" && <StartModal args={modal.args} onClose={close} />}
      {modal?.k === "event" && <EventModal id={modal.id} src={modal.id ? "event" : undefined} type={modal.type} onClose={close} />}
    </>
  );
}

/* ============ Saudação e quadrados do dia ============ */
function Greeting() {
  const st = useStore();
  const now = new Date(useNow(60_000));
  const today = todayKey();
  const nm = firstName(st.profile?.name);
  const date = keyDate(today).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return (
    <section className="hello" aria-label="Saudação">
      <h2 className="hello-t">{greeting(now.getHours())}{nm ? `, ${nm}` : ""}!</h2>
      <p className="hello-m">{motto(today)}</p>
      <p className="hello-d">Hoje é {date}.</p>
    </section>
  );
}

function TodayTiles({ cards, open }: { cards: DayCard[]; open: Open }) {
  const st = useStore();
  const color = (c: DayCard) => (c.kind === "rotina" ? "var(--line)" : c.kind === "livre" ? "var(--accent)" : c.kind === "tarefa" ? "var(--warn)" : st.subjects.find((s) => s.id === c.subject_id)?.color || "var(--accent)");
  const done = (t: NonNullable<DayCard["todo"]>) => st.save("tasks", { ...t, done: true, done_at: new Date().toISOString() });
  const when = (c: DayCard) => (c.at == null ? (c.kind === "nao_coube" ? "não coube nos blocos" : c.kind === "calendario" ? "sem horário" : "") : `${fromMin(c.at)}${c.end != null ? `–${fromMin(c.end)}` : ""}`);
  return (
    <section className="panel">
      <div className="panel-h"><h2>O que você vai fazer hoje</h2><span className="lbl">{qt(cards.filter((c) => !c.past).length, "item", "itens")}</span></div>
      {cards.length ? (
        <div className="tiles">{cards.map((c) => (
          <div key={c.key} className={"tile" + (c.past ? " past" : "") + (c.kind === "sem_aula" ? " off" : "")} style={{ ["--c" as string]: color(c) }} title={c.task?.why}>
            <span className="tile-w">{when(c)}{c.past ? " · já passou" : ""}</span>
            <span className="tile-k">{c.tag}</span>
            <b className="tile-t">{c.title}</b>
            {c.sub && <span className="tile-s">{c.sub}</span>}
            {c.task && <span className="tile-s">{c.task.minutes} min</span>}
            {c.task && !c.past && (
              <span className="row" style={{ gap: 6, marginTop: "auto", paddingTop: 6 }}>
                <button className="btn sm" disabled={!!st.profile?.timer} title={st.profile?.timer ? "Já existe uma sessão em andamento" : undefined}
                  onClick={() => open({ k: "start", args: { subject_id: c.task!.subject_id, topic_id: c.task!.topic_id, activity: ACT_OF[c.task!.kind] } })}><Icon d={I.play} s={13} />Começar</button>
                {c.task.item_id && <button className="btn sm pri" onClick={() => open({ k: "review", id: c.task!.item_id! })}>Revisei</button>}
              </span>
            )}
            {c.todo && <span style={{ marginTop: "auto", paddingTop: 6 }}><button className="btn sm" onClick={() => done(c.todo!)}>Feito</button></span>}
          </div>
        ))}</div>
      ) : <Empty title="Nada marcado para hoje">Monte sua rotina semanal (aulas e blocos de estudo) no Calendário: o app encaixa as revisões e as aulas para estudar.<Link className="btn sm pri" href="/calendario#rotina">Montar minha rotina</Link></Empty>}
      {cards.some((c) => c.task) && <p className="small muted" style={{ margin: "10px 0 0" }}>Passe o mouse numa tarefa de estudo para ver por que ela entrou hoje. O motivo de cada uma também fica na lista logo abaixo.</p>}
    </section>
  );
}

const ACT_OF: Record<Task["kind"], Activity> = { revisao: "revisao", consolidar: "revisao", adiantar: "leitura", preparar: "exercicios" };
const KIND_CHIP: Record<Task["kind"], [string, string]> = { revisao: ["Revisão", "acc"], consolidar: ["Consolidar aula", "ok"], adiantar: ["Adiantar", "warn"], preparar: ["Preparar prova", "bad"] };

function TaskRow({ t, at, open }: { t: Task; at?: string; open: Open }) {
  const st = useStore();
  const s = st.subjects.find((x) => x.id === t.subject_id);
  return (
    <div className="li" style={{ alignItems: "flex-start" }}>
      {at ? <span className="cdays">{at}</span> : <Dot c={s?.color || "var(--muted)"} />}
      <div className="grow">
        <div className="t">{t.title}</div>
        <div className="m"><span className="row" style={{ gap: 6, display: "inline-flex" }}><Dot c={s?.color || "var(--muted)"} />{s?.name}</span> · {t.minutes} min · <span className={"chip " + KIND_CHIP[t.kind][1]}>{KIND_CHIP[t.kind][0]}</span></div>
        <div className="m" style={{ marginTop: 2 }}>{t.why}</div>
      </div>
      <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
        <button className="btn sm" disabled={!!st.profile?.timer} title={st.profile?.timer ? "Já existe uma sessão em andamento" : undefined}
          onClick={() => open({ k: "start", args: { subject_id: t.subject_id, topic_id: t.topic_id, activity: ACT_OF[t.kind] } })}>
          <Icon d={I.play} s={14} />Começar</button>
        {t.item_id && <button className="btn sm pri" onClick={() => open({ k: "review", id: t.item_id! })}>Revisei</button>}
      </div>
    </div>
  );
}

/* ============ Plano do dia ============ */
/** Planejamento reverso com os dados do app */
function useReverse() {
  const st = useStore();
  const now = new Date(useNow(60_000));
  const today = todayKey();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const plans = reversePlan({
    today, nowMin, blocks: st.blocks, events: st.events, subjects: st.subjects, topics: st.topics, sessions: st.sessions,
    assessments: st.assessments, items: st.reviews, logs: st.reviewLogs, mistakes: st.mistakes, cfg: masteryCfg(st.profile?.mastery_cfg),
  });
  return { plans, today, nowMin };
}

function PlanTab({ open, goRoutine, goExams }: { open: Open; goRoutine: () => void; goExams: () => void }) {
  const st = useStore();
  const { plans, today, nowMin } = useReverse();
  const input: PlanInput = {
    today, nowMin, pref: st.profile?.study_pref || "depois", blocks: st.blocks, events: st.events,
    subjects: st.subjects, topics: st.topics, sessions: st.sessions, assessments: st.assessments, items: st.reviews, mistakes: st.mistakes,
    logs: st.reviewLogs, cfg: masteryCfg(st.profile?.mastery_cfg), extra: todayTasks(plans, today),
  };
  const plan = planDay(input);
  const [print, setPrint] = useState<"hoje" | "amanha" | "semana" | null>(null);
  const tomorrow = addDays(today, 1);
  const printInput: PlanInput = print === "amanha" ? { ...input, today: tomorrow, nowMin: 0, extra: todayTasks(plans, tomorrow) } : input;
  const subOf = (id: string) => st.subjects.find((s) => s.id === id);
  const openItems = st.reviews.filter((i) => subOf(i.subject_id) && !subOf(i.subject_id)!.archived && itemState(i, st.assessments, today).open);
  const due = openItems.filter((i) => i.due <= today);
  const week = Array.from({ length: 7 }, (_, d) => {
    const k = addDays(today, d + 1);
    const its = openItems.filter((i) => i.due === k);
    return { k, n: its.length, min: its.reduce((a, i) => a + i.est_min, 0) };
  });
  const steps = cleanSteps(st.profile?.review_steps);

  // SUB: oferece reativar as revisões da prova que ela substituiria
  const subOffers = activeSubjects(st.subjects).flatMap((s) => {
    if (s.recovery !== "sub") return [];
    const items = st.assessments.filter((a) => a.subject_id === s.id);
    const calc = gradeCalc(s, items);
    return items.filter((a) => a.kind === "sub" && a.grade == null && a.date && a.date >= today).flatMap((sub) => {
      // só depois da última prova que esta SUB cobre: antes disso, reativar faria o conteúdo acumular
      const provaPending = items.some((a) => a.kind === "prova" && a.sub_id === sub.id && a.grade == null && a.status !== "cancelado" && (!a.date || a.date >= today));
      const r = calc.subs.find((x) => x.id === sub.id);
      if (provaPending || !r?.target) return [];
      const closed = st.reviews.filter((i) => i.assessment_id === r.target!.id && i.active && !itemState(i, st.assessments, today).open);
      return closed.length ? [{ s, sub, r, closed }] : [];
    });
  });
  const reactivate = async (o: (typeof subOffers)[number]) => {
    const rows: ReviewItem[] = o.closed.map((i) => ({ ...i, assessment_id: o.sub.id, step: 0, due: firstDue(steps, today, o.sub.date) }));
    if (await st.saveMany("review_items", rows)) st.toast(`${qt(rows.length, "revisão reativada", "revisões reativadas")} até a SUB de ${o.s.name}.`);
  };

  const dateLabel = keyDate(today).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const cards = dayCards({ day: today, nowMin, blocks: st.blocks, events: st.events, agenda: agenda(st.subjects, st.assessments, st.events), subjects: st.subjects, plan, todos: st.todos });
  return (
    <>
      <TodayTiles cards={cards} open={open} />
      <section className="panel" aria-label="Imprimir ou salvar em PDF">
        <div className="row" style={{ gap: 6 }}>
          <b className="grow">Plano em PDF <span className="small muted" style={{ fontWeight: 400 }}>(imprimir ou &quot;Salvar como PDF&quot;)</span></b>
          <button className="btn sm" onClick={() => setPrint("hoje")}>Plano de hoje</button>
          <button className="btn sm" onClick={() => setPrint("amanha")}>Plano de amanhã</button>
          <button className="btn sm pri" onClick={() => setPrint("semana")}>Plano da semana</button>
        </div>
      </section>
      {print === "semana" ? <WeekPrint start={today} onDone={() => setPrint(null)} /> : print && <DayPrint input={printInput} onDone={() => setPrint(null)} />}

      <section className="kpis">
        <div className="kpi"><span className="lbl">Tempo livre para estudo</span><span className="v">{fmtMin(plan.capacity)}</span><span className="s">no resto de {dateLabel}</span></div>
        <div className="kpi"><span className="lbl">Tarefas pedem</span><span className="v" style={{ color: plan.need > plan.capacity ? "var(--warn)" : undefined }}>{fmtMin(plan.need)}</span><span className="s">{plan.overflow.length ? `${plan.overflow.length} não couberam` : "tudo cabe"}</span></div>
        <div className="kpi"><span className="lbl">Revisões vencidas</span><span className="v">{due.length}</span><span className="s">{qt(due.filter((i) => i.due < today).length, "atrasada", "atrasadas")}</span></div>
        <div className="kpi"><span className="lbl">Próximos 7 dias</span><span className="v">{week.reduce((a, d) => a + d.n, 0)}</span><span className="s">~{fmtMin(week.reduce((a, d) => a + d.min, 0))} de revisão</span></div>
      </section>

      {!plan.hasStudyBlocks && (
        <div className="callout info stack" style={{ gap: 8 }}>
          <span><b>Monte sua rotina para o plano funcionar.</b> Cadastre seus horários de aula e os blocos em que você costuma estudar. O plano encaixa revisões e aulas nesses blocos, sem inventar horários.</span>
          <span className="row"><button className="btn sm pri" onClick={goRoutine}>Montar minha rotina</button><button className="btn sm" onClick={() => open({ k: "siga" })}>Importar aulas do SIGA (PDF)</button></span>
        </div>
      )}
      {easyReminders(today, st.subjects, st.assessments).map((r) => (
        <div key={r.key} className="callout"><b>{r.text}</b> <span className="small muted">{r.why}</span></div>
      ))}
      <TripsPanel onEdit={(id) => open({ k: "event", id })} />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn sm ghost" onClick={() => open({ k: "event", id: null, type: "viagem" })}><Icon d={I.plus} s={14} />Vai viajar? Adicionar viagem</button>
      </div>
      {plan.notes.map((n) => <div key={n} className="callout">{n}</div>)}
      {plans.filter((pl) => pl.missing > 0 && pl.topics.length).map((pl) => (
        <div key={pl.exam.id} className="callout"><b>{pl.exam.name} de {pl.subject.name} em {qt(pl.days, "dia", "dias")}: não cabe tudo.</b> Faltam {pl.missing} min de estudo antes da prova.
          <PriorityList pl={pl} /> <button className="btn sm ghost" onClick={goExams}>Ver o plano da prova</button></div>
      ))}
      {subOffers.map((o) => (
        <div key={o.sub.id} className="callout info stack" style={{ gap: 8 }}>
          <span><b>{o.sub.name} de {o.s.name} em {dm(o.sub.date!)}.</b> Ela substituiria {o.r.target!.name} (nota {nf(o.r.target!.value)}).
            {o.r.base == null ? " Lance as notas na disciplina para ver quanto a SUB precisa."
              : o.r.need != null ? (o.r.need > 10 ? " Mesmo com 10 na SUB, a média não chega à mínima." : ` Para chegar à média mínima, a SUB precisa de ${nf(Math.max(0, o.r.need))}.`)
                : ` Sua média (${nf(o.r.base)}) já atinge a mínima; a SUB só serviria para melhorar a nota.`}
            {" "}{o.closed.length === 1 ? `A revisão de ${o.r.target!.name} foi encerrada` : `As ${o.closed.length} revisões de ${o.r.target!.name} foram encerradas`} com a prova. Reativar até a SUB?</span>
          <span><button className="btn sm pri" onClick={() => reactivate(o)}>Reativar até a SUB</button></span>
        </div>
      ))}


      {(plan.slots.some((x) => x.placed.length) || plan.overflow.length > 0) && (
        <details className="panel">
          <summary>Tarefas de estudo de hoje, com o motivo de cada uma</summary>
          <div className="list" style={{ marginTop: 10 }}>
            {plan.slots.flatMap((x) => x.placed).map((p) => <TaskRow key={p.task.key} t={p.task} at={fromMin(p.start)} open={open} />)}
            {plan.overflow.map((t) => <TaskRow key={t.key} t={t} at="não coube" open={open} />)}
          </div>
          {plan.overflow.length > 0 && <p className="small muted" style={{ margin: "8px 0 0" }}>
            {plan.hasStudyBlocks ? "As que não couberam nos blocos de estudo que sobram hoje continuam valendo: as revisões voltam amanhã, na frente das novas, se ainda forem as mais urgentes." : "Sem blocos de estudo na rotina, estas são as tarefas de hoje em ordem de prioridade."}
          </p>}
        </details>
      )}

      <section className="grid g2">
        <div className="panel">
          <div className="panel-h"><h2>Próximos 7 dias</h2><span className="lbl">revisões agendadas</span></div>
          <div className="list">{week.map((d) => (
            <div key={d.k} className="li"><span className="cdays">{WD_S[keyDate(d.k).getDay()]} {dm(d.k)}</span>
              <div className="grow small">{d.n ? `${qt(d.n, "revisão", "revisões")} · ~${fmtMin(d.min)}` : <span className="muted">nenhuma</span>}</div></div>
          ))}</div>
        </div>
        <div className="panel">
          <div className="panel-h"><h2>Provas chegando</h2><button className="btn sm ghost" onClick={goExams}>Plano completo</button></div>
          {plans.length ? <div className="list">{plans.map((pl) => {
            const done = pl.topics.reduce((a, t) => a + Math.min(t.done, t.target), 0), goal = pl.topics.reduce((a, t) => a + t.target, 0);
            return (
              <div key={pl.exam.id} className="li"><span className={"cdays " + (pl.missing ? "bad" : pl.days <= 7 ? "warn" : "")}>{pl.days} d</span>
                <div className="grow"><div className="t">{pl.exam.name} · {pl.subject.name}</div>
                  <div className="m">{pl.topics.length ? `${qt(pl.topics.length, "conteúdo", "conteúdos")} · estudado ${done} de ${goal} min da meta${pl.missing ? ` · faltam ${pl.missing} min que não cabem` : ""}` : "sem conteúdos ligados"}</div></div></div>
            );
          })}</div> : <p className="small muted" style={{ margin: 0 }}>Nenhuma prova nos próximos 30 dias.</p>}
        </div>
      </section>

      <details className="small">
        <summary>Como o plano é montado</summary>
        <ol className="muted" style={{ margin: ".5em 0 0", paddingLeft: "1.2em" }}>
          <li>Usa só os blocos de <b>estudo</b> da sua rotina para o dia da semana, a partir de agora. Compromissos e dias &quot;Indisponível&quot; do calendário tiram blocos.</li>
          <li>Entram as revisões com data até hoje (cuja prova ainda não passou) e as aulas: <b>consolidar</b> a de hoje (depois do fim da aula) ou <b>adiantar</b> a de amanhã, conforme a sua preferência ({PREF[st.profile?.study_pref || "depois"].toLowerCase()} por padrão; cada disciplina pode ter a sua).</li>
          <li>Ordem: revisões de provas em até 3 dias; depois as aulas; depois as demais revisões pela prova mais próxima, atraso, peso da prova, menor índice de domínio do conteúdo e mais erros registrados.</li>
          <li>Cada tarefa entra inteira no primeiro bloco onde cabe. O que não couber aparece nos quadrados como &quot;não coube nos blocos&quot;, sem ser escondido.</li>
        </ol>
      </details>
    </>
  );
}

/* ============ Revisar: revisões (de conteúdo e de erros) ============ */
function ReviewsTab({ open }: { open: Open }) {
  const st = useStore();
  const today = todayKey();
  const steps = cleanSteps(st.profile?.review_steps);
  const live = st.reviews.filter((i) => st.subjects.some((s) => s.id === i.subject_id && !s.archived));
  const rows = live.map((i) => ({ i, state: itemState(i, st.assessments, today) }));
  const openRows = rows.filter((r) => r.state.open).sort((a, b) => a.i.due.localeCompare(b.i.due));
  const closed = rows.filter((r) => !r.state.open);
  const lastLog = (id: string) => st.reviewLogs.find((l) => l.item_id === id);
  const Row = ({ i, why, isOpen }: { i: ReviewItem; why: string; isOpen: boolean }) => {
    const s = st.subjects.find((x) => x.id === i.subject_id);
    const dd = daysBetween(today, i.due);
    const tn = topicName(st.topics, i.topic_id);
    const l = lastLog(i.id);
    return (
      <div className="li" style={{ alignItems: "flex-start" }}>
        {isOpen ? <span className={"cdays " + (dd < 0 ? "bad" : dd === 0 ? "warn" : "")}>{dd < 0 ? `${-dd} d atraso` : dd === 0 ? "hoje" : dm(i.due)}</span> : <span className="cdays">encerrada</span>}
        <div className="grow">
          <div className="t">{i.title}{i.mistake_id && <span className="chip" style={{ marginLeft: 6 }}>erro</span>}</div>
          <div className="m"><span className="row" style={{ gap: 6, display: "inline-flex" }}><Dot c={s?.color || "var(--muted)"} />{s?.name}</span>{tn ? ` · ${tn}` : ""} · intervalo {Math.min(i.step, steps.length - 1) + 1} de {steps.length} · {i.est_min} min</div>
          <div className="m">{why}{l ? ` Última: ${new Date(l.reviewed_at).toLocaleDateString("pt-BR")}.` : ""}</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {isOpen && <button className="btn sm pri" onClick={() => open({ k: "review", id: i.id })}>Revisei</button>}
          <button className="btn icon ghost" onClick={() => open({ k: "item", id: i.id })} aria-label="Editar revisão"><Icon d={I.edit} s={15} /></button>
        </div>
      </div>
    );
  };
  return (
    <>
      <section className="panel">
        <div className="panel-h"><h2>Para revisar</h2>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn sm pri" onClick={() => open({ k: "mistake", id: null })}><Icon d={I.plus} s={14} />Registrar erro</button>
            <button className="btn sm" onClick={() => open({ k: "item", id: null })}><Icon d={I.plus} s={14} />Revisão de conteúdo</button>
          </div>
        </div>
        <p className="small muted" style={{ margin: "0 0 10px" }}>Revisões de conteúdo e dos erros que você registrou, juntas, da mais urgente para a mais distante.</p>
        {openRows.length ? <div className="list">{openRows.map(({ i, state }) => <Row key={i.id} i={i} why={state.why} isOpen />)}</div>
          : <Empty title="Nada para revisar agora">Registre um erro (ele já agenda a revisão) ou crie a revisão de um conteúdo.</Empty>}
      </section>
      {closed.length > 0 && (
        <details className="panel">
          <summary>Encerradas ({closed.length})</summary>
          <div className="list" style={{ marginTop: 10 }}>{closed.map(({ i, state }) => <Row key={i.id} i={i} why={state.why} isOpen={false} />)}</div>
        </details>
      )}
      <details className="small">
        <summary>Como as datas são calculadas</summary>
        <div className="muted stack" style={{ marginTop: 6, gap: 6 }}>
          <span>Intervalos atuais: {steps.join(", ")} dias (mude em Calendário → Rotina semanal). Quem decide é o <b>resultado conferido</b> e a <b>autonomia</b>; a confiança fica registrada mas não muda a data.</span>
          <span>Resolveu sozinho: sobe um intervalo. Com consulta ou ajuda: mantém. Viu a resolução ou resolveu parcialmente: desce um. Não conseguiu: volta ao primeiro. &quot;Ainda não conferi&quot;: não muda.</span>
          <span>Nenhuma data passa da véspera da prova ligada à revisão. Depois que a prova acontece, a revisão se encerra sozinha. Sem prova, o intervalo máximo é 14 dias.</span>
        </div>
      </details>
    </>
  );
}

/* ============ Revisar: histórico de erros ============ */
function MistakesTab({ open }: { open: Open }) {
  const st = useStore();
  const subs = activeSubjects(st.subjects, true);
  const [sub, setSub] = useState("");
  const [cat, setCat] = useState<MistakeCategory | "">("");
  const bySub = st.mistakes.filter((m) => !sub || m.subject_id === sub);
  const list = bySub.filter((m) => !cat || mistakeCats(m).includes(cat)).sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
  const counts = (Object.keys(MISTAKE) as MistakeCategory[]).map((k) => ({ k, n: bySub.filter((m) => mistakeCats(m).includes(k)).length })).filter((x) => x.n).sort((a, b) => b.n - a.n);
  const max = Math.max(1, ...counts.map((c) => c.n));
  return (
    <>
      <section className="panel">
        <div className="panel-h"><h2>Erros que mais se repetem</h2><span className="lbl">{qt(bySub.length, "erro registrado", "erros registrados")}</span></div>
        <div className="row" style={{ marginBottom: 12 }}>
          <select value={sub} onChange={(e) => setSub(e.target.value)} aria-label="Disciplina" style={{ width: "auto" }}><option value="">Todas as disciplinas</option>{subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          {cat && <button className="btn sm ghost" onClick={() => setCat("")}>Limpar filtro: {MISTAKE[cat]}</button>}
        </div>
        {counts.length ? (
          <div className="stack" style={{ gap: 6 }}>
            {counts.map((c) => (
              <button key={c.k} type="button" className="row" onClick={() => setCat(cat === c.k ? "" : c.k)} aria-pressed={cat === c.k}
                style={{ all: "unset", cursor: "pointer", display: "flex", gap: 10, alignItems: "center", opacity: cat && cat !== c.k ? 0.5 : 1 }}>
                <span className="small" style={{ width: 150, flex: "none" }}>{MISTAKE[c.k]}</span>
                <div className="bar" style={{ flex: 1 }}><i style={{ width: `${(c.n / max) * 100}%`, background: "var(--accent)" }} /></div>
                <span className="num small" style={{ width: 28, textAlign: "right" }}>{c.n}</span>
              </button>
            ))}
            <p className="small muted" style={{ margin: "6px 0 0" }}>{bySub.length < 5 ? `Só ${qt(bySub.length, "erro registrado", "erros registrados")}: ainda é cedo para tirar conclusões sobre o tipo mais comum.` : "Clique num tipo para filtrar a lista."}</p>
          </div>
        ) : <Empty title="Nenhum erro registrado">Ao avaliar uma sessão com resultado parcial ou errado, o app oferece registrar o erro. Você também pode usar &quot;Registrar erro&quot; acima.</Empty>}
      </section>
      {list.length > 0 && (
        <details className="panel" open={cat ? true : undefined}>
          <summary>Histórico de erros ({list.length}{cat ? ` · ${MISTAKE[cat]}` : ""})</summary>
          <div className="list" style={{ marginTop: 10 }}>{list.map((m) => {
            const s = st.subjects.find((x) => x.id === m.subject_id), tn = topicName(st.topics, m.topic_id);
            const rv = st.reviews.find((r) => r.mistake_id === m.id);
            return (
              <div key={m.id} className="li clickable" onClick={() => open({ k: "mistake", id: m.id })}>
                <span className="cdays">{dm(m.occurred_on)}</span>
                <div className="grow">
                  <div className="t">{m.description}</div>
                  <div className="m"><span className="row" style={{ gap: 6, display: "inline-flex" }}><Dot c={s?.color || "var(--muted)"} />{s?.name}</span>{tn ? ` · ${tn}` : ""}{m.source ? ` · ${m.source}` : ""}{m.correction ? " · correção anotada" : ""}</div>
                </div>
                <div className="row hide-m" style={{ gap: 6 }}>
                  <span className="chip">{mistakeCats(m).map((c) => MISTAKE[c]).join(" + ")}</span>
                  {rv && <span className="chip acc" title="Revisão deste erro">{rv.active && rv.due >= todayKey() ? `revisão ${dm(rv.due)}` : "revisão"}</span>}
                </div>
              </div>
            );
          })}</div>
        </details>
      )}
    </>
  );
}

/* ============ Provas (planejamento reverso) ============ */
function ExamsTab({ open }: { open: Open }) {
  const st = useStore();
  const { plans, today } = useReverse();
  if (!plans.length) return <Empty title="Nenhuma prova nos próximos 30 dias">Cadastre as provas com data (ou importe o cronograma na disciplina) para o app montar o plano até cada uma.</Empty>;
  return (
    <>
      {plans.map((pl) => {
        const byDay = new Map<string, typeof pl.chunks>();
        for (const c of pl.chunks) byDay.set(c.day, [...(byDay.get(c.day) || []), c]);
        return (
          <section key={pl.exam.id} className="panel">
            <div className="panel-h">
              <h2><Dot c={pl.subject.color} /> {pl.exam.name} · {pl.subject.name}</h2>
              <span className={"chip " + (pl.missing ? "bad" : pl.days <= 7 ? "warn" : "")}>{dm(pl.exam.date!)} · em {qt(pl.days, "dia", "dias")}</span>
            </div>
            {pl.priority.length > 0 && <div className="callout small" style={{ marginBottom: 8 }}><PriorityList pl={pl} /></div>}
            {pl.notes.map((n) => <div key={n} className={"callout small" + (n.startsWith("Conteúdos que ainda") ? " info" : "")} style={{ marginBottom: 8 }}>{n}</div>)}
            {pl.topics.length > 0 && (
              <div className="tbl-wrap"><table>
                <thead><tr><th>Conteúdo</th><th>Domínio</th><th className="n">Meta</th><th className="n">Já estudou</th><th className="n">Falta</th></tr></thead>
                <tbody>{pl.topics.map((t) => (
                  <tr key={t.topic.id}>
                    <td>{t.topic.name}{t.available && <span className="small muted"> · aula em {dm(t.available)}</span>}</td>
                    <td>{t.band ? <span className={"chip " + BAND[t.band][1]}>{t.score} · {BAND[t.band][0]}</span> : <span className="chip">sem dados</span>}</td>
                    <td className="n">{t.target}</td><td className="n">{t.done}</td><td className="n" style={{ color: t.need ? undefined : "var(--ok)" }}>{t.need || "✓"}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
            {pl.chunks.length > 0 && (
              <div className="list" style={{ marginTop: 10 }}>{[...byDay.entries()].map(([d, cs]) => (
                <div key={d} className="li" style={{ alignItems: "flex-start" }}>
                  <span className={"cdays " + (d === today ? "warn" : "")}>{d === today ? "hoje" : `${WD_S[keyDate(d).getDay()]} ${dm(d)}`}</span>
                  <div className="grow small">{cs.map((c) => (
                    <div key={c.key} className="row" style={{ gap: 6, justifyContent: "space-between" }} title={c.why}>
                      <span>{c.final ? <b>{c.title}</b> : c.title} · {c.minutes} min</span>
                      {d === today && <button className="btn sm" disabled={!!st.profile?.timer} onClick={() => open({ k: "start", args: { subject_id: c.subjectId, topic_id: c.topicId, activity: c.final ? "revisao" : "exercicios" } })}><Icon d={I.play} s={13} />Começar</button>}
                    </div>
                  ))}</div>
                </div>
              ))}</div>
            )}
          </section>
        );
      })}
      <details className="small">
        <summary>Como o planejamento reverso é montado</summary>
        <ol className="muted" style={{ margin: ".5em 0 0", paddingLeft: "1.2em" }}>
          <li>Entram as provas dos próximos 30 dias e os conteúdos ligados a cada uma (ou, para a próxima prova, os conteúdos sem prova marcada).</li>
          <li>Meta de estudo por conteúdo, pelo índice de domínio: sem dados ou frágil {TARGET.sem} min; em construção {TARGET.construcao} min; dominado {TARGET.dominado} min. Desconta o que você já estudou do conteúdo nas últimas semanas.</li>
          <li>O tempo vem dos seus blocos de estudo, deixando {Math.round(RESERVE * 100)}% de cada dia para revisões espaçadas e aulas. A prova mais próxima usa o tempo primeiro.</li>
          <li>Pedaços de até 45 min, no máximo um por conteúdo por dia (estudo espaçado rende mais que maratona). Conteúdo ainda não dado só entra a partir da aula.</li>
          <li>Na véspera: {FINAL_MIN} min de revisão geral (resumo, erros registrados, prova antiga), sem conteúdo novo.</li>
          <li>Nada fica gravado: conforme você registra sessões, o que falta diminui e o plano se refaz. O que não couber aparece como aviso.</li>
        </ol>
      </details>
    </>
  );
}

/** Quando não cabe tudo: o que priorizar, por quê e como */
function PriorityList({ pl }: { pl: ExamPlan }) {
  if (!pl.priority.length) return null;
  return (
    <span style={{ display: "block", marginTop: 6 }}>
      <b>Para chegar mais seguro, priorize:</b>
      <ol style={{ margin: "4px 0 4px 18px", padding: 0 }}>
        {pl.priority.map((x) => <li key={x.topic.id}><b>{x.topic.name}</b>: {x.why}. Como: {x.how}.</li>)}
      </ol>
      <span className="muted">O tempo que existe já vai primeiro para esses. Nos outros conteúdos, uma revisão rápida (resumo e dois ou três exercícios) ajuda a não ficar em branco.</span>
    </span>
  );
}
