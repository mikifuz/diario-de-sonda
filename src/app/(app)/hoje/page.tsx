"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { agenda, useStore } from "@/lib/store";
import { addDays, fmtMin, keyDate, todayKey, qt } from "@/lib/calc";
import { dm, fromMin, planDay, whereNext, type PlanInput, type Task } from "@/lib/plan";
import { PREF, WD_S } from "@/lib/constants";
import { FINAL_MIN, RESERVE, TARGET, reversePlan, todayTasks, type ExamPlan } from "@/lib/reverse";
import type { Activity, CalEvent, EventType } from "@/lib/types";
import { Dot, Empty, I, Icon, Tabs, useNow } from "@/components/ui";
import { ImportSigaModal } from "@/components/importSiga";
import { DayPrint } from "@/components/dayPrint";
import { easyReminders } from "@/lib/effort";
import { WeekPrint } from "@/components/weekPrint";
import { StartModal, type StartArgs } from "@/components/studyStart";
import { EventModal } from "@/components/modals";
import { GettingStarted } from "@/components/onboarding";
import { dayCards, firstName, greeting, motto, type DayCard } from "@/lib/today";
import { TripsPanel } from "@/components/trips";
import { ExamExercises } from "@/components/exercises";

type Tab = "plano" | "provas";
const TABS: [Tab, string][] = [["plano", "Plano do dia"], ["provas", "Provas"]];
// links antigos (?aba=revisar, ?aba=revisoes, ?aba=erros): as revisões e o banco de erros saíram; abre o plano
const OLD: Record<string, Tab> = { revisar: "plano", revisoes: "plano", erros: "plano" };
type ModalState = null | { k: "siga" } | { k: "start"; args: StartArgs } | { k: "event"; id: string | null; type?: EventType };
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
      {tab === "provas" && <ExamsTab open={setModal} goRoutine={() => router.push("/calendario#rotina")} />}
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

function TodayTiles({ cards, open, force }: { cards: DayCard[]; open: Open; force: (key: string) => void }) {
  const st = useStore();
  const color = (c: DayCard) => (c.kind === "rotina" ? "var(--line)" : c.kind === "livre" ? "var(--accent)" : c.kind === "tarefa" ? "var(--warn)" : st.subjects.find((s) => s.id === c.subject_id)?.color || "var(--accent)");
  const done = (t: NonNullable<DayCard["todo"]>) => st.save("tasks", { ...t, done: true, done_at: new Date().toISOString() });
  const when = (c: DayCard) => (c.at == null ? (c.kind === "nao_coube" ? (c.moved ? `não cabe hoje · vai para ${c.moved.label}` : "não cabe hoje nem nos próximos dias") : c.kind === "calendario" || c.kind === "estudo" ? "sem horário" : "") : `${fromMin(c.at)}${c.end != null ? `–${fromMin(c.end)}` : ""}`);
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
                {c.kind === "nao_coube"
                  ? <button className="btn sm" onClick={() => force(c.task!.key)} title="Vira um quadrado sem horário hoje">Fazer hoje mesmo assim</button>
                  : <button className="btn sm" disabled={!!st.profile?.timer} title={st.profile?.timer ? "Já existe uma sessão em andamento" : undefined}
                    onClick={() => open({ k: "start", args: { subject_id: c.task!.subject_id, topic_id: c.task!.topic_id, activity: ACT_OF[c.task!.kind] } })}><Icon d={I.play} s={13} />Começar</button>}
              </span>
            )}
            {c.todo && <span style={{ marginTop: "auto", paddingTop: 6 }}><button className="btn sm" onClick={() => done(c.todo!)}>Feito</button></span>}
          </div>
        ))}</div>
      ) : <Empty title="Nada marcado para hoje">Monte sua rotina semanal (aulas e blocos de estudo) no Calendário: o app encaixa o estudo das provas e das aulas.<Link className="btn sm pri" href="/calendario#rotina">Montar minha rotina</Link></Empty>}
      {cards.some((c) => c.task) && <p className="small muted" style={{ margin: "10px 0 0" }}>Passe o mouse numa tarefa de estudo para ver por que ela entrou hoje. O motivo de cada uma também fica na lista logo abaixo.{cards.some((c) => c.kind === "nao_coube") ? " O que não cabe hoje vai sozinho para o próximo horário de estudo livre." : ""}</p>}
    </section>
  );
}

/** Sem tarefa de estudo hoje (blocos já passaram, fim de semana sem bloco): o próximo do plano das provas,
 *  para quem quiser adiantar. Antes a tela ficava vazia mesmo com prova chegando. */
function NextUp({ plans, today, free, open }: { plans: ExamPlan[]; today: string; free: number; open: Open }) {
  const st = useStore();
  const next = plans.flatMap((pl) => pl.chunks.filter((c) => c.day > today).map((c) => ({ c, pl })))
    .sort((a, b) => a.c.day.localeCompare(b.c.day) || a.pl.days - b.pl.days).slice(0, 3);
  if (!next.length) return null;
  return (
    <section className="panel">
      <div className="panel-h"><h2>Quer adiantar?</h2><span className="lbl">o próximo do plano das provas</span></div>
      <p className="small muted" style={{ margin: "0 0 8px" }}>{free ? "O plano das provas não marcou estudo para hoje." : "Hoje não sobrou horário de estudo na sua rotina."} Se quiser estudar agora, é isto que vem a seguir:</p>
      <div className="list">{next.map(({ c, pl }) => (
        <div key={c.key} className="li" style={{ alignItems: "flex-start" }}>
          <span className="cdays">{WD_S[keyDate(c.day).getDay()]} {dm(c.day)}</span>
          <div className="grow"><div className="t">{c.final ? c.title : c.whole ? `Estudar ${pl.subject.name} para a ${pl.exam.name}` : `Estudar ${c.title} para a ${pl.exam.name}`}</div>
            <div className="m"><span className="row" style={{ gap: 6, display: "inline-flex" }}><Dot c={pl.subject.color} />{pl.subject.name}</span> · {c.minutes} min · {pl.exam.name} em {dm(pl.exam.date!)}</div></div>
          <button className="btn sm" disabled={!!st.profile?.timer} onClick={() => open({ k: "start", args: { subject_id: c.subjectId, topic_id: c.topicId, activity: c.final ? "revisao" : "exercicios" } })}><Icon d={I.play} s={13} />Começar</button>
        </div>
      ))}</div>
    </section>
  );
}

const ACT_OF: Record<Task["kind"], Activity> = { consolidar: "revisao", adiantar: "leitura", preparar: "exercicios" };
const KIND_CHIP: Record<Task["kind"], [string, string]> = { consolidar: ["Consolidar aula", "ok"], adiantar: ["Adiantar", "warn"], preparar: ["Preparar prova", "bad"] };

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
    assessments: st.assessments,
  });
  return { plans, today, nowMin };
}

/** Tarefas que não couberam e a pessoa quis fazer hoje mesmo assim (só neste aparelho, só no dia) */
const FORCE_KEY = "ds-fazer-hoje";
function useForced(today: string): [Set<string>, (key: string) => void] {
  const read = () => {
    try { const j = JSON.parse(localStorage.getItem(FORCE_KEY) || "null"); return new Set<string>(j && j.day === today ? j.keys : []); } catch { return new Set<string>(); }
  };
  const [set, setSet] = useState<Set<string>>(read);
  useEffect(() => { setSet(read()); }, [today]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = (key: string) => {
    const next = new Set(set).add(key);
    setSet(next);
    try { localStorage.setItem(FORCE_KEY, JSON.stringify({ day: today, keys: [...next] })); } catch { /* sem armazenamento */ }
  };
  return [set, add];
}

const hm = (m: number) => (m % 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${m / 60}h`);
const dayName = (d: string, today: string) => (d === today ? "hoje" : d === addDays(today, 1) ? "amanhã" : `${WD_S[keyDate(d).getDay()].toLowerCase()} (${dm(d)})`);

/** Prova em que não cabe tudo: quanto falta e onde dá para estudar a mais (horários livres de verdade) */
function MissingCard({ pl, today, goRoutine, goExams }: { pl: ExamPlan; today: string; goRoutine: () => void; goExams?: () => void }) {
  const st = useStore();
  const [busy, setBusy] = useState(false);
  const add = async (w: ExamPlan["suggest"][number]) => {
    // banco ainda sem a coluna end_time (migration não rodada): avisa em vez de criar um item que não conta
    if (!st.demo && st.events.length && !st.events.some((e) => "end_time" in e)) { st.toast("Para marcar estudo extra, o banco precisa ser atualizado (migration de day off e estudo extra)."); return; }
    setBusy(true);
    const ev: CalEvent = { id: crypto.randomUUID(), subject_id: pl.subject.id, title: `Estudo extra: ${pl.subject.name}`, type: "estudo", date: w.day, time: fromMin(w.start), end_time: fromMin(w.end), priority: "alta", status: "pendente", description: `Para a ${pl.exam.name} (${dm(pl.exam.date!)}).` };
    if (await st.save("events", ev)) st.toast(`Estudo marcado ${dayName(w.day, today)}, ${fromMin(w.start)}–${fromMin(w.end)}. O plano já foi refeito.`);
    setBusy(false);
  };
  return (
    <div className="callout stack" style={{ gap: 8 }}>
      <span><b>Faltam {fmtMin(pl.missing)} até a {pl.exam.name} de {pl.subject.name} ({dm(pl.exam.date!)}).</b> Seus horários de estudo até lá não dão conta. Dá para:</span>
      <span className="row" style={{ gap: 6 }}>
        <button className="btn sm" onClick={goRoutine}>Criar um bloco de estudo na rotina</button>
        {pl.suggest.map((w) => (
          <button key={w.day + w.start} className="btn sm pri" disabled={busy} onClick={() => add(w)} title="Cria um item &quot;Estudo planejado&quot; no calendário; o plano encaixa o estudo nele">
            Estudar {dayName(w.day, today)}, {fromMin(w.start)}–{fromMin(w.end)} ({hm(w.end - w.start)}), que está livre</button>
        ))}
      </span>
      {!pl.suggest.length && <span className="small muted">Não achei nenhum horário livre (8h às 22h, sem nada na rotina nem no calendário) até a véspera da prova.</span>}
      <PriorityList pl={pl} />
      {goExams && <span><button className="btn sm ghost" onClick={goExams}>Ver o plano da prova</button></span>}
    </div>
  );
}

function PlanTab({ open, goRoutine, goExams }: { open: Open; goRoutine: () => void; goExams: () => void }) {
  const st = useStore();
  const { plans, today, nowMin } = useReverse();
  const input: PlanInput = {
    today, nowMin, pref: st.profile?.study_pref || "depois", blocks: st.blocks, events: st.events,
    subjects: st.subjects, topics: st.topics, sessions: st.sessions, assessments: st.assessments, extra: todayTasks(plans, today),
  };
  const plan = planDay(input);
  const [forced, force] = useForced(today);
  const moved = whereNext(input, plan.overflow.filter((t) => !forced.has(t.key)), (d) => todayTasks(plans, d));
  const [print, setPrint] = useState<"hoje" | "amanha" | "semana" | null>(null);
  const tomorrow = addDays(today, 1);
  const printInput: PlanInput = print === "amanha" ? { ...input, today: tomorrow, nowMin: 0, extra: todayTasks(plans, tomorrow) } : input;

  const dateLabel = keyDate(today).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const cards = dayCards({ day: today, nowMin, blocks: st.blocks, events: st.events, agenda: agenda(st.subjects, st.assessments, st.events), subjects: st.subjects, plan, todos: st.todos, forced, moved });
  const late = plan.overflow.filter((t) => !forced.has(t.key));
  // provas em que não cabe tudo (a mais próxima primeiro)
  const short = plans.filter((pl) => pl.missing > 0 && (pl.topics.length || pl.chunks.length));
  return (
    <>
      {plan.off && <div className="callout info"><b>Hoje é seu day off 😴</b> Nada de estudo no plano de hoje: o estudo das provas foi para os outros dias. Para cancelar a folga, vá na Sala.</div>}
      <TodayTiles cards={cards} open={open} force={force} />
      {!plan.off && !cards.some((c) => c.task?.kind === "preparar" && !c.past) && <NextUp plans={plans} today={today} free={plan.capacity} open={open} />}
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
        <div className="kpi"><span className="lbl">Tarefas pedem</span><span className="v" style={{ color: plan.need > plan.capacity ? "var(--warn)" : undefined }}>{fmtMin(plan.need)}</span><span className="s">{late.length ? `${qt(late.length, "vai", "vão")} para outro dia` : "tudo cabe"}</span></div>
      </section>

      {!plan.hasStudyBlocks && (
        <div className="callout info stack" style={{ gap: 8 }}>
          <span><b>Monte sua rotina para o plano funcionar.</b> Cadastre seus horários de aula e os blocos em que você costuma estudar. O plano encaixa o estudo das provas e das aulas nesses blocos, sem inventar horários.</span>
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
      {plan.notes.filter((n) => !plan.off || !n.startsWith("Hoje é seu day off")).map((n) => <div key={n} className="callout">{n}</div>)}
      {short.slice(0, 2).map((pl) => <MissingCard key={pl.exam.id} pl={pl} today={today} goRoutine={goRoutine} goExams={goExams} />)}
      {short.length > 2 && (
        <details className="panel">
          <summary>Mais {qt(short.length - 2, "prova", "provas")} em que falta tempo</summary>
          <div className="stack" style={{ marginTop: 10 }}>{short.slice(2).map((pl) => <MissingCard key={pl.exam.id} pl={pl} today={today} goRoutine={goRoutine} goExams={goExams} />)}</div>
        </details>
      )}

      {(plan.slots.some((x) => x.placed.length) || plan.overflow.length > 0) && (
        <details className="panel">
          <summary>Tarefas de estudo de hoje, com o motivo de cada uma</summary>
          <div className="list" style={{ marginTop: 10 }}>
            {plan.slots.flatMap((x) => x.placed).map((p) => <TaskRow key={p.task.key} t={p.task} at={fromMin(p.start)} open={open} />)}
            {plan.overflow.map((t) => {
              const m = moved.get(t.key);
              return <TaskRow key={t.key} t={t} at={forced.has(t.key) || !plan.hasStudyBlocks ? "sem horário" : m ? `vai p/ ${m.label.split(",")[0]}` : "não cabe"} open={open} />;
            })}
          </div>
          {late.length > 0 && plan.hasStudyBlocks && <p className="small muted" style={{ margin: "8px 0 0" }}>
            O que não cabe nos blocos de estudo que sobram hoje vai sozinho para o próximo horário livre: a aula volta no plano de amanhã enquanto você não estudar a matéria, e o estudo das provas é redistribuído (o plano das provas se refaz todo dia). Se quiser fazer hoje mesmo assim, toque em &quot;Fazer hoje mesmo assim&quot; no quadrado.
          </p>}
        </details>
      )}

      <section className="panel">
        <div className="panel-h"><h2>Provas chegando</h2><button className="btn sm ghost" onClick={goExams}>Plano completo</button></div>
        {plans.length ? <div className="list">{plans.map((pl) => {
          const done = pl.topics.reduce((a, t) => a + Math.min(t.done, t.target), 0), goal = pl.topics.reduce((a, t) => a + t.target, 0);
          return (
            <div key={pl.exam.id} className="li"><span className={"cdays " + (pl.missing ? "bad" : pl.days <= 7 ? "warn" : "")}>{pl.days} d</span>
              <div className="grow"><div className="t">{pl.exam.name} · {pl.subject.name}</div>
                <div className="m">{pl.topics.length ? `${qt(pl.topics.length, "conteúdo", "conteúdos")} · estudado ${fmtMin(done)} de ${fmtMin(goal)} da meta${pl.missing ? ` · faltam ${fmtMin(pl.missing)} que não cabem` : ""}` : `sem conteúdos cadastrados: tempo para a matéria toda${pl.missing ? ` · faltam ${fmtMin(pl.missing)} que não cabem` : ""}`}</div></div></div>
          );
        })}</div> : <p className="small muted" style={{ margin: 0 }}>Nenhuma prova nos próximos 30 dias.</p>}
      </section>

      <details className="small">
        <summary>Como o plano é montado</summary>
        <ol className="muted" style={{ margin: ".5em 0 0", paddingLeft: "1.2em" }}>
          <li>Usa só os blocos de <b>estudo</b> da sua rotina para o dia da semana, a partir de agora, e os &quot;Estudo planejado&quot; do calendário com início e fim. Compromissos e dias &quot;Indisponível&quot; do calendário tiram blocos; no day off não há estudo.</li>
          <li>Entram o estudo das provas que o planejamento reverso (aba Provas) marcou para hoje e as aulas: <b>consolidar</b> a de hoje (depois do fim da aula) ou <b>adiantar</b> a de amanhã, conforme a sua preferência ({PREF[st.profile?.study_pref || "depois"].toLowerCase()} por padrão; cada disciplina pode ter a sua).</li>
          <li>Ordem: estudo de provas em até 3 dias; depois o estudo das outras provas; depois as aulas.</li>
          <li>Cada tarefa entra inteira no primeiro bloco onde cabe. O que não couber vai para o próximo horário livre, e o quadrado diz quando.</li>
        </ol>
      </details>
    </>
  );
}

/* ============ Provas (planejamento reverso) ============ */
function ExamsTab({ open, goRoutine }: { open: Open; goRoutine: () => void }) {
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
            {pl.missing > 0 && <div style={{ marginBottom: 8 }}><MissingCard pl={pl} today={today} goRoutine={goRoutine} /></div>}
            {pl.notes.filter((n) => !(pl.missing > 0 && n.startsWith("Faltam"))).map((n) => <div key={n} className={"callout small" + (n.startsWith("Conteúdos que ainda") ? " info" : "")} style={{ marginBottom: 8 }}>{n}</div>)}
            <ExamExercises exam={pl.exam} />
            {pl.topics.length > 0 && (
              <div className="tbl-wrap"><table>
                <thead><tr><th>Conteúdo</th><th className="n">Meta (min)</th><th className="n">Já estudou</th><th className="n">Falta</th></tr></thead>
                <tbody>{pl.topics.map((t) => (
                  <tr key={t.topic.id}>
                    <td>{t.topic.name}{t.available && <span className="small muted"> · aula em {dm(t.available)}</span>}</td>
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
          <li>Entram as provas dos próximos 30 dias (também as cadastradas só no calendário) e os conteúdos ligados a cada uma (ou, para a próxima prova, os conteúdos sem prova marcada). Prova sem nenhum conteúdo cadastrado recebe tempo para a matéria toda: 4 h, ajustadas pela dificuldade da matéria para você.</li>
          <li>Meta de estudo por conteúdo: {TARGET / 60} h, ajustadas pela dificuldade da matéria para você (fácil ×0,8; difícil ×1,5; muito difícil ×2). Desconta o que você já estudou do conteúdo nas últimas semanas.</li>
          <li>O tempo vem dos seus blocos de estudo (e dos &quot;Estudo planejado&quot; do calendário), deixando {Math.round(RESERVE * 100)}% de cada dia para as aulas. A prova mais próxima usa o tempo primeiro; dentro de cada prova, o que você estudou menos vem antes. Day off e viagem não têm estudo.</li>
          <li>Pedaços de até 45 min, no máximo um por conteúdo por dia (estudo espaçado rende mais que maratona). Conteúdo ainda não dado só entra a partir da aula.</li>
          <li>Na véspera: {FINAL_MIN} min de revisão geral (resumo e prova antiga), sem conteúdo novo.</li>
          <li>Nada fica gravado: conforme você registra sessões, o que falta diminui e o plano se refaz. Se não couber tudo, o app mostra horários livres para estudar a mais.</li>
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
      <span className="muted">O tempo que existe já vai primeiro para esses (os menos estudados). Nos outros conteúdos, uma revisão rápida (resumo e dois ou três exercícios) ajuda a não ficar em branco.</span>
    </span>
  );
}
