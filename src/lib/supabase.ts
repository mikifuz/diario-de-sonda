import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/** false enquanto as variáveis de ambiente do Supabase não forem configuradas */
export const configured = /^https:\/\//.test(url) && !url.includes("SEU-PROJETO") && key.length > 20;

let client: SupabaseClient | null = null;
export function sb(): SupabaseClient {
  if (!client) {
    client = createClient(url || "https://nao-configurado.supabase.co", key || "nao-configurado", {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

/** Mensagem legível para erros do Supabase/Postgres */
export function friendlyError(e: { message?: string; code?: string } | null | undefined): string {
  if (!e) return "Erro desconhecido.";
  const m = e.message || "";
  if (/Invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
  if (/Email not confirmed/i.test(m)) return "Confirme seu e-mail antes de entrar. Procure a mensagem na sua caixa de entrada.";
  if (/User already registered/i.test(m)) return "Já existe uma conta com este e-mail. Use Entrar.";
  if (/Password should be at least/i.test(m)) return "A senha precisa ter pelo menos 8 caracteres.";
  if (/Password is known to be weak|pwned|leaked/i.test(m)) return "Essa senha já apareceu em vazamentos na internet. Escolha outra.";
  if (/rate limit/i.test(m)) return "Muitas tentativas seguidas. Aguarde alguns minutos.";
  if (e.code === "23514" && /_len|_size|friend_code/.test(m)) return "Texto grande demais para este campo. Encurte e tente de novo.";
  if (e.code === "23514") return "Algum valor está fora do permitido (ex.: nota acima de 10).";
  if (e.code === "23503") return "Este registro depende de outro que não existe mais. Recarregue a página.";
  if (e.code === "42501") return "Sem permissão para esta ação.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Sem conexão com o servidor. Verifique sua internet.";
  return m || "Não foi possível concluir. Tente de novo.";
}
