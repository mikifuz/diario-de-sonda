// Service worker do Fundo do Poço: só mostra os avisos que o servidor manda e abre a tela certa
// ao tocar. Não guarda nada em cache (o app continua precisando de internet).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Fundo do Poço", {
    body: d.body || "",
    icon: "/icone-192.png",
    badge: "/icone-96.png",
    tag: d.tag || undefined,
    data: { url: d.url || "/painel" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/painel", self.location.origin).href;
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of list) {
      if (new URL(c.url).origin !== self.location.origin) continue;
      try { await c.focus(); await c.navigate(url); return; } catch { /* abre uma janela nova */ }
    }
    await self.clients.openWindow(url);
  })());
});
