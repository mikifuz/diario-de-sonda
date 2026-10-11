"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { configured, sb } from "@/lib/supabase";
import { DataProvider } from "@/lib/store";
import { DemoRoomProvider, RoomProvider } from "@/lib/room";
import { buildDemo, DEMO_FLAG, DEMO_UID } from "@/lib/demo";
import { Shell } from "@/components/Shell";
import { NotConfigured } from "@/components/Brand";

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<{ id: string; email: string } | null | undefined>(undefined);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  // modo demonstração: liga por /demo (fica só nesta aba do navegador)
  const [demo, setDemo] = useState<ReturnType<typeof buildDemo> | null | undefined>(undefined);
  useEffect(() => {
    let on = false;
    try { on = sessionStorage.getItem(DEMO_FLAG) === "1"; } catch { /* armazenamento indisponível */ }
    setDemo(on ? buildDemo() : null);
  }, []);

  useEffect(() => {
    if (demo !== null || !configured) return;
    const auth = sb().auth;
    auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      if (!u) { setUser(null); router.replace("/entrar"); } else setUser({ id: u.id, email: u.email || "" });
    });
    const { data } = auth.onAuthStateChange((ev, session) => {
      if (ev === "SIGNED_OUT" || !session) { setUser(null); router.replace("/entrar"); }
      else setUser((cur) => (cur && cur.id === session.user.id ? cur : { id: session.user.id, email: session.user.email || "" }));
    });
    return () => data.subscription.unsubscribe();
  }, [router, demo]);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 3200);
    return () => clearTimeout(t);
  }, [toastMsg]);
  const toast = useCallback((m: string) => setToastMsg(m), []);

  if (demo === undefined) return <div className="auth-wrap"><div className="empty"><b>Abrindo o diário…</b></div></div>;
  if (demo) return (
    <DataProvider uid={DEMO_UID} email="modo demonstração" onToast={toast} demo={demo.data}>
      <DemoRoomProvider demo={demo.room}>
        <Shell>{children}</Shell>
      </DemoRoomProvider>
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </DataProvider>
  );
  if (!configured) return <NotConfigured />;
  if (!user) return <div className="auth-wrap"><div className="empty"><b>Abrindo o diário…</b></div></div>;

  return (
    <DataProvider key={user.id} uid={user.id} email={user.email} onToast={toast}>
      <RoomProvider>
        <Shell>{children}</Shell>
      </RoomProvider>
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </DataProvider>
  );
}
