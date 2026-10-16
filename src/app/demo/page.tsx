"use client";
// Abre o modo demonstração: dados de exemplo só na memória desta aba, sem conta.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DEMO_FLAG } from "@/lib/demo";

export default function Demo() {
  const router = useRouter();
  useEffect(() => {
    try { sessionStorage.setItem(DEMO_FLAG, "1"); } catch { /* sem armazenamento: a demonstração não abre */ }
    router.replace("/hoje");
  }, [router]);
  return <div className="auth-wrap"><div className="empty"><b>Abrindo a demonstração…</b></div></div>;
}
