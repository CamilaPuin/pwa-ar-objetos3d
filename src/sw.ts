/// <reference lib="webworker" />
// sw.ts — Service Worker propio del Atlas 3D (Sesión 37).
// Equivale al sw-propio.js del Gestor (Sesión 26), pero aquí Vite lo empaqueta:
// puede importar módulos de Workbox y los de nuestro propio código.
// vite-plugin-pwa inyecta la lista de precaché donde está self.__WB_MANIFEST.
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { clientsClaim } from "workbox-core";
import { abrirBaseDeDatos } from "./db";
import { descargarPendientes, ETIQUETA_SYNC } from "./descargas";

declare const self: ServiceWorkerGlobalScope;

// Background Sync no está en los tipos estándar de TypeScript: se declara lo mínimo que usamos.
interface SyncEvent extends ExtendableEvent {
  readonly tag: string;
  readonly lastChance: boolean;
}

// Con registerType:"autoUpdate" y un SW propio, activar la versión nueva
// es TU trabajo (con generateSW lo hacía el plugin).
self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  ({ url }) => url.pathname.startsWith("/iconos/"),
  new CacheFirst({
    cacheName: "imagenes",
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 })],
  })
);
registerRoute(({ url }) => url.pathname.startsWith("/api/"), new NetworkFirst({ cacheName: "api-atlas3d" }));

// Las fichas /modelos/*.json NO están en el precaché (se excluyeron en
// vite.config.ts): solo entran a la caché «modelos-3d» cuando el usuario las
// descarga. Mientras no estén ahí, esta ruta las pide a la red; si ya están,
// responde desde la caché aunque no haya conexión.
registerRoute(
  ({ url }) => url.pathname.startsWith("/modelos/"),
  async ({ request }) => {
    const guardada = await caches.match(request, { cacheName: "modelos-3d" });
    return guardada ?? fetch(request);
  }
);

// ── Background Sync: terminar las descargas pendientes ─────────────────────
async function avisarALasVentanas(mensaje: unknown): Promise<readonly WindowClient[]> {
  const ventanas = await self.clients.matchAll({ type: "window" });
  ventanas.forEach((v) => v.postMessage(mensaje));
  return ventanas;
}

self.addEventListener("sync", (event) => {
  const syncEvent = event as SyncEvent;
  if (syncEvent.tag !== ETIQUETA_SYNC) return;
  syncEvent.waitUntil(
    (async () => {
      const db = await abrirBaseDeDatos();
      try {
        const n = await descargarPendientes(db, async (hechos, total) => {
          await avisarALasVentanas({ tipo: "progreso", hechos, total });
        });
        if (n === 0) return;
        const ventanas = await avisarALasVentanas({ tipo: "descarga-completa" });
        // Notificación solo si NO hay ninguna ventana visible.
        if (!ventanas.some((v) => v.visibilityState === "visible")) {
          await self.registration.showNotification("Modelos listos", {
            body: "Las fichas ya están en tu dispositivo: puedes consultarlas sin conexión.",
            icon: "/iconos/icon-192.png",
            tag: "atlas-descarga",
            data: { url: "/" },
          });
        }
      } catch (err) {
        // lastChance: el navegador ya no reintentará. Es el momento de decirle
        // al usuario que NO pudo completarse (si no, el fallo sería silencioso).
        if (syncEvent.lastChance) {
          await self.registration.showNotification("No se pudo completar la descarga", {
            body: "Abre el Atlas con conexión y vuelve a pulsar «Descargar».",
            icon: "/iconos/icon-192.png",
            tag: "atlas-descarga",
            data: { url: "/" },
          });
        }
        throw err; // relanzar: así el navegador sabe que falló y reintenta
      } finally {
        db.close();
      }
    })()
  );
});

// ── Clic en una notificación: enfocar la app abierta o abrirla ─────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL(event.notification.data?.url ?? "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const abierta = ventanas.find((v) => new URL(v.url).origin === self.location.origin);
      if (abierta) return abierta.focus();
      return self.clients.openWindow(destino);
    })()
  );
});
