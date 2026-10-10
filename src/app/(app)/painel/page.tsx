"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { activeSubjects, agenda, useStore } from "@/lib/store";
import { addDays, daysBetween, dkey, fmtMin, gradeCalc, inRange, keyDate, nf, pct, periodRange, stats, todayKey, verified, weekStartKey, type Period } from "@/lib/calc";
import { GRADED } from "@/lib/constants";
import { ChartCalib, ChartDays, ChartLine, Gauge, type DayBar } from "@/components/charts";
import { Dot, Empty, I, Icon, Tabs } from "@/components/ui";
import { EventModal, SubjectModal } from "@/components/modals";

export default function Painel() {
  const st = useStore();
  const router = useRouter();
  const [per, setPer] = useState<Period>("mes");
  const [modal, setModal] = useState<null | { k: "subject" } | { k: "event"; id: string | null; src?: "event" | "item" }>(null);
  const all = st.sessions, t = todayKey(), list = activeSubjects(st.subjects);
  const modals = modal && (modal.k === "subject" ? <SubjectModal id={null} onClose={() => setModal(null)} /> : <EventModal id={modal.id} src={modal.src} onClose={() => setModal(null)} />);

  if (!list.length && !all.length) {
    return (
      <>
        <section className="panel" style={{ padding: 28 }}>
          <div className="stack" style={{ gap: 16, maxWidth: 760 }}>
            <span className="lbl">Primeiro acesso</span>
            <h2 style={{ fontSize: "calc(1.6rem*var(--display-scale))" }}>Comece o boletim do seu semestre</h2>
            <p style={{ margin: 0, maxWidth: "62ch" }}>O diário cruza três coisas que costumam ficar separadas: quanto você estudou, quão seguro se sentiu e quanto realmente acertou. Com poucas semanas de registros ele mostra onde a confiança e o resultado não andam juntos.</p>
            <div className="steps">
              <div><span className="n">PASSO 1</span><b>Cadastre as disciplinas</b><span className="small muted">Nome, professor, média mínima e os conteúdos de cada uma.</span><button className="btn pri sm" onClick={() => setModal({ k: "subject" })}><Icon d={I.plus} s={14} />Nova disciplina</button></div>
              <div><span className="n">PASSO 2</span><b>Registre uma sessão</b><span className="small muted">Use o cronômetro e responda 3 perguntas rápidas ao terminar.</span><Link className="btn sm" href="/sessoes"><Icon d={I.play} s={14} />Ir para sessões</Link></div>
              <div><span className="n">PASSO 3</span><b>Coloque as provas</b><span className="small muted">Com pesos e datas, o sistema calcula quanto você precisa tirar.</span><button className="btn sm" onClick={() => setModal({ k: "event", id: null })}><Icon d={I.plus} s={14} />Adicionar prova</button></div>
            </div>
            <p className="small muted" style={{ margin: 0 }}>Já usava a primeira versão? Importe sua cópia em <Link href="/configuracoes">Configurações</Link>.</p>
          </div>
        </section>
        {modals}
      </>
    );
  }

  const sum = (r: [string, string]) => all.filter((s) => inRange(s, r)).reduce((a, s) => a + s.duration_min, 0);
  const mToday = sum([t, t]), mWeek = sum(periodRange("semana")), mMonth = sum(periodRange("mes"));
  const nWeek = all.filter((s) => inRange(s, periodRange("semana"))).length;
  const goal = Number(st.profile?.weekly_goal_h) || 0;
  const itemsOf = (id: string) => st.assessments.filter((a) => a.subject_id === id);
  const avgs = list.map((s) => gradeCalc(s, itemsOf(s.id)).partial).filter((v): v is number => v != null);
  const avg = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
  const rng = periodRange(per), inP = all.filter((s) => inRange(s, rng)), sp = stats(inP);

  const days: DayBar[] = [];
  for (let i = 13; i >= 0; i--) {
    const k = addDays(t, -i);
    const segs: DayBar["segs"] = [];
    for (const s of list) {
      const v = all.filter((x) => x.subject_id === s.id && dkey(x.started_at) === k).reduce((a, x) => a + x.duration_min, 0);
      if (v) segs.push({ v, c: s.color, n: s.name });
    }
    const other = all.filter((x) => !list.some((s) => s.id === x.subject_id) && dkey(x.started_at) === k).reduce((a, x) => a + x.duration_min, 0);
    if (other) segs.push({ v: other, c: "var(--muted)", n: "Arquivadas" });
    days.push({ lab: String(keyDate(k).getDate()), segs, total: segs.reduce((a, x) => a + x.v, 0), today: i === 0 });
  }
  const bySub = list.map((s) => ({ s, st: stats(inP.filter((x) => x.subject_id === s.id)) })).sort((a, b) => b.st.min - a.st.min);
  const maxMin = Math.max(1, ...bySub.map((x) => x.st.min));
  const cal = [1, 2, 3, 4, 5].map((c) => {
    const v = inP.filter((s) => s.confidence === c).map(verified).filter((x): x is number => x != null);
    return { n: v.length, acc: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null };
  });
  const calN = cal.reduce((a, r) => a + r.n, 0);
  const wk: { lab: string; conf: number | null; acc: number | null }[] = [];
  for (let i = 7; i >= 0; i--) {
    const a = addDays(weekStartKey(t), -7 * i), b = addDays(a, 6), s2 = stats(all.filter((s) => inRange(s, [a, b])));
    const d = keyDate(a);
    wk.push({ lab: `${d.getDate()}/${d.getMonth() + 1}`, conf: s2.conf, acc: s2.acc });
  }
  const alerts: { sub: string; text: string }[] = [];
  for (const x of list) {
    const s2 = stats(all.filter((s) => s.subject_id === x.id && inRange(s, periodRange("30"))));
    if (s2.accN >= 3 && s2.conf != null && s2.acc != null) {
      if (s2.conf >= 4 && s2.acc < 0.6) alerts.push({ sub: x.name, text: `você se avalia com confiança ${nf(s2.conf)}/5, mas acertou ${pct(s2.acc)} do que conferiu nos últimos 30 dias.` });
      if (s2.conf <= 2.5 && s2.acc >= 0.8) alerts.push({ sub: x.name, text: `seus resultados (${pct(s2.acc)}) estão melhores do que sua confiança (${nf(s2.conf)}/5) sugere.` });
    }
  }
  const ag = agenda(st.subjects, st.assessments, st.events);
  const up = ag.filter((e) => e.date >= t && e.date <= addDays(t, 21) && GRADED.includes(e.type) && e.status === "pendente").slice(0, 6);
  const pend = ag.filter((e) => e.date >= t && e.status === "pendente").length;

  return (
    <>
      <section className="kpis" aria-label="Resumo">
        <div className="kpi"><span className="lbl">Hoje</span><span className="v">{fmtMin(mToday)}</span><span className="s">{all.filter((s) => dkey(s.started_at) === t).length} sessão(ões)</span></div>
        <div className="kpi"><span className="lbl">Esta semana</span><span className="v">{fmtMin(mWeek)}</span>
          <span className="s">{goal ? `${pct(Math.min(1, mWeek / 60 / goal))} da meta de ${nf(goal, 0)}h` : <>{nWeek} sessões · <Link href="/configuracoes">definir meta</Link></>}</span>
          {goal > 0 && <div className="bar" style={{ marginTop: 4 }}><i style={{ width: `${Math.min(100, (mWeek / 60 / goal) * 100)}%`, background: "var(--accent)" }} /></div>}</div>
        <div className="kpi"><span className="lbl">Este mês</span><span className="v">{fmtMin(mMonth)}</span><span className="s">{all.filter((s) => inRange(s, periodRange("mes"))).length} sessões</span></div>
        <div className="kpi"><span className="lbl">Média parcial</span><span className="v">{avg == null ? "–" : nf(avg)}</span><span className="s">{avg == null ? "sem notas lançadas" : `média das ${avgs.length} disciplina(s) com notas`}</span></div>
      </section>
      {alerts.length > 0 && <section className="callout" aria-label="Alertas"><div className="stack" style={{ gap: 6 }}>{alerts.map((a, i) => <div key={i}>Em <b>{a.sub}</b> {a.text}</div>)}</div></section>}
      <section className="grid g3">
        <div className="panel span2">
          <div className="panel-h"><h2>Horas por dia</h2><span className="lbl">últimos 14 dias</span></div>
          {days.some((d) => d.total) ? <ChartDays days={days} /> : <Empty>Nenhuma sessão nos últimos 14 dias.<Link className="btn pri sm" href="/sessoes"><Icon d={I.play} s={14} />Iniciar sessão</Link></Empty>}
          <div className="legend" style={{ marginTop: 8 }}>{list.map((s) => <span key={s.id}><i style={{ background: s.color }} />{s.name}</span>)}</div>
        </div>
        <div className="panel">
          <div className="panel-h"><h2>Próximas avaliações</h2><span className="lbl">{pend} pendente(s)</span></div>
          {up.length ? (
            <div className="list">{up.map((e) => {
              const s = list.find((x) => x.id === e.subject_id), dd = daysBetween(t, e.date), gc = s && e.src === "item" ? gradeCalc(s, itemsOf(s.id)) : null;
              return (
                <div key={e.id} className="li clickable" onClick={() => setModal({ k: "event", id: e.id, src: e.src })}>
                  <span className={"cdays " + (dd <= 3 ? "bad" : dd <= 7 ? "warn" : "")}>{dd === 0 ? "hoje" : dd === 1 ? "amanhã" : `${dd} dias`}</span>
                  <div className="grow"><div className="t">{e.title}</div><div className="m">{s ? s.name + " · " : ""}{keyDate(e.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}{e.time ? " " + e.time : ""}{gc && gc.needed != null ? ` · precisa de ${nf(Math.max(0, gc.needed))} nas restantes` : ""}</div></div>
                </div>
              );
            })}</div>
          ) : <Empty>Nenhuma avaliação nas próximas 3 semanas.<button className="btn sm" onClick={() => setModal({ k: "event", id: null })}><Icon d={I.plus} s={14} />Adicionar prova</button></Empty>}
        </div>
      </section>
      <section className="panel">
        <div className="panel-h"><h2>Confiança × resultado</h2><Tabs value={per} onChange={setPer} label="Período" options={[["semana", "Semana"], ["mes", "Mês"], ["semestre", "Semestre"], ["tudo", "Tudo"]]} /></div>
        <div className="grid g3">
          <div className="stack">
            <Gauge v={sp.acc} label="Acerto conferido" sub={`${sp.accN} registro(s) conferido(s)`} color="var(--ok)" />
            <Gauge v={sp.conf == null ? null : (sp.conf - 1) / 4} label="Confiança declarada" sub={sp.conf == null ? "sem autoavaliações" : `média ${nf(sp.conf)} de 5 · ${sp.confN} registro(s)`} color="var(--accent)" />
            <Gauge v={sp.solo} label="Resolvido sozinho" sub={sp.auN ? `${sp.auN} registro(s) com autonomia` : "sem registros de autonomia"} color="var(--warn)" />
            <p className="small muted" style={{ margin: 0 }}>Os três medidores são independentes. Confiança é o que você sentiu; acerto é o que foi conferido; autonomia é quanto precisou de apoio.</p>
          </div>
          <div>
            <h3 style={{ marginBottom: 6 }}>Calibração</h3>
            <p className="small muted" style={{ margin: "0 0 8px" }}>Para cada nível de confiança, quanto você realmente acertou. A linha tracejada é a referência de uma confiança bem ajustada.</p>
            {calN ? <ChartCalib rows={cal} /> : <Empty>Registre sessões com autoavaliação e resultado conferido para ver a calibração.</Empty>}
          </div>
          <div className="stack">
            <div><h3>Confiança média por semana</h3>{wk.some((w) => w.conf != null) ? <ChartLine label="Confiança média por semana" pts={wk.map((w) => w.conf)} min={1} max={5} fmt={(v) => nf(v)} labels={wk.map((w) => w.lab)} color="var(--accent)" /> : <p className="muted small">Sem autoavaliações ainda.</p>}</div>
            <div><h3>Acerto conferido por semana</h3>{wk.some((w) => w.acc != null) ? <ChartLine label="Acerto conferido por semana" pts={wk.map((w) => w.acc)} min={0} max={1} fmt={(v) => Math.round(v * 100) + "%"} labels={wk.map((w) => w.lab)} color="var(--ok)" /> : <p className="muted small">Sem resultados conferidos ainda.</p>}</div>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-h"><h2>Disciplinas no período</h2><span className="lbl">{fmtMin(sp.min)} no total</span></div>
        {bySub.length ? (
          <div className="tbl-wrap"><table>
            <thead><tr><th>Disciplina</th><th style={{ width: "30%" }}>Horas</th><th className="n">Sessões</th><th className="n">Confiança</th><th className="n">Acerto</th><th className="n">Média parcial</th></tr></thead>
            <tbody>{bySub.map(({ s, st: x }) => {
              const gc = gradeCalc(s, itemsOf(s.id));
              return (
                <tr key={s.id} className="clickable" onClick={() => router.push(`/disciplinas/${s.id}`)}>
                  <td><span className="row" style={{ gap: 8, flexWrap: "nowrap" }}><Dot c={s.color} /><span className="t">{s.name}</span></span></td>
                  <td><div className="row" style={{ flexWrap: "nowrap" }}><div className="bar" style={{ flex: 1, minWidth: 60 }}><i style={{ width: `${(x.min / maxMin) * 100}%`, background: s.color }} /></div><span className="num small" style={{ minWidth: 64, textAlign: "right" }}>{fmtMin(x.min)}</span></div></td>
                  <td className="n">{x.n}</td><td className="n">{x.conf == null ? "–" : nf(x.conf)}</td><td className="n">{pct(x.acc)}</td>
                  <td className="n" style={{ color: gc.partial == null ? "var(--muted)" : gc.partial >= gc.min ? "var(--ok)" : "var(--bad)" }}>{gc.partial == null ? "–" : nf(gc.partial)}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        ) : <Empty>Cadastre disciplinas para ver esta tabela.</Empty>}
      </section>
      {modals}
    </>
  );
}
