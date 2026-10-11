"use client";
// Guia de primeiros passos (ordem combinada com o dono): SIGA → cronograma e notas → rotina de estudo → estudar.
// Cada passo se marca sozinho pelos dados; nada é gravado além de "esconder o guia" neste aparelho.
import Link from "next/link";
import { useEffect, useState } from "react";
import { activeSubjects, useStore } from "@/lib/store";
import { I, Icon } from "./ui";

interface Step { title: string; text: string; done: boolean; doneText?: string; action?: { label: string; href: string }; extra?: { label: string; href: string } }

export function useGuide() {
  const st = useStore();
  const subs = activeSubjects(st.subjects);
  const withPlan = subs.filter((s) => st.topics.some((t) => t.subject_id === s.id) && st.assessments.some((a) => a.subject_id === s.id));
  const pending = subs.find((s) => !withPlan.includes(s));
  const steps: Step[] = [
    {
      title: "Importe suas aulas do SIGA",
      text: "No SIGA, baixe o Comprovante de matrícula (PDF) e envie aqui: o diário cria suas disciplinas e coloca os horários de aula na rotina. O arquivo não sai do seu aparelho.",
      done: st.blocks.some((b) => b.kind === "aula"),
      doneText: "Aulas na rotina.",
      action: { label: "Importar do SIGA", href: "/hoje?aba=rotina&abrir=siga" },
      extra: subs.length ? undefined : { label: "Prefiro cadastrar as disciplinas à mão", href: "/disciplinas" },
    },
    {
      title: "Envie o cronograma de cada disciplina",
      text: "O cronograma do professor (Excel, Word, PDF ou texto) traz os conteúdos com a data de cada aula e as provas. Com ele o diário sabe o que cai em cada prova. Depois confira em Notas os pesos e se cada prova tem SUB.",
      done: subs.length > 0 && !pending,
      doneText: `Cronograma em ${subs.length === 1 ? "sua disciplina" : `todas as ${subs.length} disciplinas`}.`,
      action: pending ? { label: `Cronograma de ${pending.name}`, href: `/disciplinas/${pending.id}?abrir=cronograma` } : undefined,
    },
    {
      title: "Diga quando você vai estudar",
      text: "Na Rotina, adicione seus blocos de estudo (só eles recebem tarefas), trabalho, estágio e outros compromissos, e escolha se prefere adiantar a matéria antes da aula ou revisar depois.",
      done: st.blocks.some((b) => b.kind === "estudo"),
      doneText: "Blocos de estudo na rotina.",
      action: { label: "Ajustar minha rotina", href: "/hoje?aba=rotina" },
    },
    {
      title: "Comece a estudar",
      text: "O Plano do dia já mostra o que fazer em cada bloco, com o motivo. Comece pela primeira tarefa e, ao terminar, responda a autoavaliação rápida.",
      done: st.sessions.length > 0,
      doneText: "Primeira sessão registrada.",
      action: { label: "Ver o plano do dia", href: "/hoje" },
    },
  ];
  // um passo só fica disponível quando o anterior estiver feito (o cronograma precisa das disciplinas)
  const next = steps.findIndex((s) => !s.done);
  const progress = pending && subs.length ? ` (${withPlan.length} de ${subs.length})` : "";
  return { steps, next, progress, allDone: next < 0 };
}

const HIDE = "ds-guia-escondido";

export function GettingStarted({ first = false }: { first?: boolean }) {
  const st = useStore();
  const { steps, next, progress, allDone } = useGuide();
  const [hidden, setHidden] = useState(true);
  useEffect(() => { try { setHidden(localStorage.getItem(HIDE) === st.profile?.id); } catch { setHidden(false); } }, [st.profile?.id]);
  if (allDone || (hidden && !first)) return null;
  const hide = () => { try { localStorage.setItem(HIDE, st.profile?.id || "1"); } catch { /* sem armazenamento */ } setHidden(true); };
  const name = st.profile?.name?.trim().split(/\s+/)[0];
  const done = steps.filter((s) => s.done).length;

  return (
    <section className="panel" style={first ? { padding: 28 } : undefined}>
      <div className="panel-h">
        <h2>{first ? `Olá${name ? `, ${name}` : ""}! Boas-vindas ao Diário de Sonda` : "Primeiros passos"}</h2>
        <span className="row" style={{ gap: 8 }}><span className="lbl">{done} de {steps.length} feitos</span>{!first && <button className="btn sm ghost" onClick={hide}>Esconder</button>}</span>
      </div>
      {first && <p style={{ margin: "0 0 12px", maxWidth: "66ch" }}>Faltam poucos passos para o diário montar seu plano de estudo sozinho: o que revisar, como se preparar para cada prova e o que pede atenção. Siga na ordem.</p>}
      <ol className="list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {steps.map((s, i) => {
          const now = i === next;
          return (
            <li key={s.title} className="li" style={{ alignItems: "flex-start", opacity: s.done || now ? 1 : 0.6 }}>
              <span className={"chip " + (s.done ? "ok" : now ? "warn" : "")} style={{ minWidth: 30, justifyContent: "center" }} aria-label={s.done ? "feito" : `passo ${i + 1}`}>{s.done ? <Icon d={I.check} s={13} /> : i + 1}</span>
              <div className="grow">
                <div className="t">{s.title}{i === 1 && !s.done ? progress : ""}</div>
                <div className="small" style={{ marginTop: 2 }}>{s.done ? <span className="muted">{s.doneText}</span> : s.text}</div>
                {!s.done && now && (s.action || s.extra) && (
                  <div className="row" style={{ marginTop: 8, gap: 6 }}>
                    {s.action && <Link className="btn sm pri" href={s.action.href}>{s.action.label}</Link>}
                    {s.extra && <Link className="btn sm ghost" href={s.extra.href}>{s.extra.label}</Link>}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {first && <p className="small muted" style={{ margin: "12px 0 0" }}>Já usava a primeira versão? Importe sua cópia em <Link href="/configuracoes">Configurações</Link>.</p>}
    </section>
  );
}
