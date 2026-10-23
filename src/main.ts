import "./style.css";
import { registerSW } from "virtual:pwa-register";
import {
  abrirBaseDeDatos,
  marcarModeloVisto,
  alternarFavorito,
  obtenerTodoElProgreso,
  guardarNotaDeEstudio,
  encolarDescargas,
  obtenerDescargas,
} from "./db";
import { derivarClaveDesdeContrasena, cifrarTexto, descifrarTexto, obtenerOCrearSal } from "./crypto";
import type { ProgresoModelo } from "./db";
import { crearVisor } from "./visor";
import { pedirPermisoOrientacion, hayOrientacionReal, iniciarControlOrientacion } from "./sensores";
import type { ControlOrientacion } from "./sensores";
import { estadoAvisos, pedirPermisoAvisos, mostrarAviso } from "./avisos";
import { ETIQUETA_SYNC, descargarPendientes } from "./descargas";
import { iniciarCamaraDeFondo, detenerCamaraDeFondo, describirErrorCamara } from "./camara";

// Punto de entrada del proyecto. El andamiaje de Vite + TypeScript + Three.js
// se confirmó en sesiones anteriores; el Service Worker se registró en la
// Sesión 28 y se migró a estrategias con nombre en la 31-32.
//
// Sesión 33: se agregó la capa de progreso en IndexedDB (favoritos, última
// visita, nota de estudio cifrada). El catálogo real de modelos 3D —
// dominio, vista, controlador — todavía no existe (se construye en sesiones
// futuras del Sub-bloque B), así que esta demo usa tres IDs de prueba, tal
// como indica la Actividad de la guía de la Sesión 33, en vez de inventar
// archivos .glb/.gltf que no están en el proyecto.
//
// Sesión 34: el sw.js manual de las Sesiones 28-32 desaparece. Ahora lo
// genera vite-plugin-pwa (Workbox integrado al build de Vite) — ver
// vite.config.ts — y se registra con registerSW() de virtual:pwa-register
// en vez de navigator.serviceWorker.register('/sw.js') a mano.

const MODELOS_DEMO: { id: string; nombre: string }[] = [
  { id: "modelo-demo-1", nombre: "Patrón MVC (de prueba)" },
  { id: "modelo-demo-2", nombre: "Arquitectura en capas (de prueba)" },
  { id: "modelo-demo-3", nombre: "Microservicios (de prueba)" },
];

const appEl = document.querySelector<HTMLDivElement>("#app")!;
let db: IDBDatabase;
let claveSesion: CryptoKey | null = null;
let progresoPorId = new Map<string, ProgresoModelo>();
let modelosDescargados = new Set<string>(); // Sesión 37: fichas ya guardadas para uso sin conexión

async function obtenerClaveSesion(): Promise<CryptoKey | null> {
  if (claveSesion) return claveSesion;
  const contrasena = window.prompt(
    "Contraseña para cifrar/descifrar la nota de estudio (la misma cada vez — no se guarda en ningún lado):"
  );
  if (!contrasena) return null;
  const sal = obtenerOCrearSal();
  claveSesion = await derivarClaveDesdeContrasena(contrasena, sal);
  return claveSesion;
}

function render() {
  appEl.innerHTML = `
    <div class="atlas-demo">
      <h1>Atlas 3D de Arquitectura de Software</h1>
      <p class="aviso-demo">
        Demo de progreso (Sesión 33) — estos tres modelos son IDs de prueba,
        no modelos 3D reales todavía.
      </p>
      <div class="modelos-grid">
        ${MODELOS_DEMO.map((m) => {
          const p = progresoPorId.get(m.id);
          const favorito = p?.favorito ?? false;
          const ultimaVisita = p?.ultimaVisita ? new Date(p.ultimaVisita).toLocaleString() : "nunca";
          const tieneNota = !!p?.notaCifrada;
          return `
            <article class="modelo-card" data-id="${m.id}">
              <h2>${m.nombre}</h2>
              <p class="meta">Última visita: ${ultimaVisita}${modelosDescargados.has(m.id) ? ' · <span class="disponible">✓ disponible sin conexión</span>' : ""}</p>
              <div class="acciones">
                <button class="btn-visitar" data-id="${m.id}">Marcar como visto</button>
                <button class="btn-favorito" data-id="${m.id}">${favorito ? "★ Favorito" : "☆ Marcar favorito"}</button>
              </div>
              <div class="nota-zona">
                <input type="text" class="nota-input" placeholder="Nota de estudio..." />
                <button class="btn-guardar-nota" data-id="${m.id}">🔒 Guardar nota</button>
                <button class="btn-ver-nota" data-id="${m.id}" ${tieneNota ? "" : "disabled"}>👁 Ver nota</button>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </div>
  `;

  appEl.querySelectorAll<HTMLButtonElement>(".btn-visitar").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id!;
      const registro = await marcarModeloVisto(db, id);
      progresoPorId.set(id, registro);
      render();
    })
  );

  appEl.querySelectorAll<HTMLButtonElement>(".btn-favorito").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id!;
      await alternarFavorito(db, id);
      const todo = await obtenerTodoElProgreso(db);
      progresoPorId = new Map(todo.map((p) => [p.modeloId, p]));
      render();
    })
  );

  appEl.querySelectorAll<HTMLButtonElement>(".btn-guardar-nota").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id!;
      const card = btn.closest(".modelo-card")!;
      const input = card.querySelector<HTMLInputElement>(".nota-input")!;
      if (!input.value.trim()) return;
      const clave = await obtenerClaveSesion();
      if (!clave) return;
      await guardarNotaDeEstudio(db, clave, id, input.value, cifrarTexto);
      const todo = await obtenerTodoElProgreso(db);
      progresoPorId = new Map(todo.map((p) => [p.modeloId, p]));
      render();
    })
  );

  appEl.querySelectorAll<HTMLButtonElement>(".btn-ver-nota").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id!;
      const p = progresoPorId.get(id);
      if (!p?.notaCifrada || !p.notaIv) return;
      const clave = await obtenerClaveSesion();
      if (!clave) return;
      try {
        const texto = await descifrarTexto(clave, { cifrado: p.notaCifrada, iv: p.notaIv });
        window.alert(`Nota de estudio de "${id}":\n\n${texto}`);
      } catch {
        window.alert("No se pudo descifrar — la contraseña ingresada no es la correcta.");
      }
    })
  );
}

async function refrescarDescargados() {
  const descargas = await obtenerDescargas(db);
  modelosDescargados = new Set(descargas.filter((d) => d.estado === "listo").map((d) => d.modeloId));
}

async function iniciar() {
  db = await abrirBaseDeDatos();
  const todo = await obtenerTodoElProgreso(db);
  progresoPorId = new Map(todo.map((p) => [p.modeloId, p]));
  await refrescarDescargados();
  render();
  // Sesión 37: una notificación puede abrir la app con ?modelo=ID para destacar esa ficha.
  const destacado = new URLSearchParams(location.search).get("modelo");
  if (destacado) {
    const tarjeta = appEl.querySelector<HTMLElement>(`[data-id="${CSS.escape(destacado)}"]`);
    tarjeta?.classList.add("destacada");
    tarjeta?.scrollIntoView({ block: "center" });
  }
}

const dbLista = iniciar();

// ── Sesión 35: visor 3D controlado por sensores de orientación ──────────────
const visor = crearVisor(document.querySelector<HTMLElement>("#visor")!);
const btnOrientacion = document.querySelector<HTMLButtonElement>("#btn-orientacion")!;
const btnCalibrar = document.querySelector<HTMLButtonElement>("#btn-calibrar")!;
const lecturaVisor = document.querySelector<HTMLElement>("#lectura-visor")!;
const avisoVisor = document.querySelector<HTMLElement>("#aviso-visor")!;
let control: ControlOrientacion | null = null;
let timerLectura = 0;

function avisarVisor(texto: string) {
  avisoVisor.textContent = texto;
  avisoVisor.hidden = !texto;
}

function apagarSensores() {
  control?.detener();
  control = null;
  window.clearInterval(timerLectura);
  visor.controlPorSensores(false);
  lecturaVisor.textContent = "";
  btnCalibrar.disabled = true;
  btnOrientacion.textContent = "📱 Rotar con el teléfono";
}

btnOrientacion.addEventListener("click", async () => {
  if (control) {
    apagarSensores(); // segundo clic: volver al control manual
    return;
  }
  const permiso = await pedirPermisoOrientacion();
  if (permiso === "denied") {
    avisarVisor("Denegaste el acceso a los sensores. Sigue disponible el control con ratón o dedo.");
    return;
  }
  if (permiso === "no-soportado" || !(await hayOrientacionReal())) {
    avisarVisor("Este dispositivo no tiene sensores de orientación. Usa el ratón o el dedo para girar el visor.");
    return;
  }
  avisarVisor("");
  visor.controlPorSensores(true);
  control = iniciarControlOrientacion((x, y) => visor.rotarHacia(x, y));
  btnCalibrar.disabled = false;
  btnOrientacion.textContent = "📱 Sensores: ACTIVOS (toca para apagar)";
  timerLectura = window.setInterval(() => {
    const { x, y } = visor.rotacionActualGrados();
    lecturaVisor.textContent = `rotación X ${x}° · Y ${y}°`;
  }, 150);
});
btnCalibrar.addEventListener("click", () => control?.calibrar());

// ── Sesión 36: cámara como fondo del visor ──────────────────────────────────
const videoFondo = document.querySelector<HTMLVideoElement>("#fondo-camara")!;
const btnCamara = document.querySelector<HTMLButtonElement>("#btn-camara")!;
let streamFondo: MediaStream | null = null;

function apagarCamara() {
  detenerCamaraDeFondo(videoFondo, streamFondo);
  streamFondo = null;
  videoFondo.hidden = true;
  visor.fondoTransparente(false);
  btnCamara.textContent = "📷 Cámara de fondo";
}

btnCamara.addEventListener("click", async () => {
  if (streamFondo) {
    apagarCamara();
    return;
  }
  avisarVisor("");
  try {
    // El permiso se pide AQUÍ, dentro del clic — no al cargar la página.
    streamFondo = await iniciarCamaraDeFondo(videoFondo);
  } catch (err) {
    avisarVisor(describirErrorCamara(err));
    return;
  }
  videoFondo.hidden = false;
  visor.fondoTransparente(true);
  btnCamara.textContent = "📷 Cámara: ACTIVA (toca para apagar)";
});

// Si el usuario cambia de pestaña o minimiza, la cámara se apaga sola:
// una cámara abierta en segundo plano gasta batería y deja el LED encendido.
document.addEventListener("visibilitychange", () => {
  if (document.hidden && streamFondo) {
    apagarCamara();
    avisarVisor("La cámara se apagó al salir de la página. Vuelve a activarla cuando quieras.");
  }
});

// ── Sesión 37: avisos y descargas para uso sin conexión ─────────────────────
const MODELOS_IDS = MODELOS_DEMO.map((m) => m.id);
const btnAvisos = document.querySelector<HTMLButtonElement>("#btn-avisos")!;
const btnDescargar = document.querySelector<HTMLButtonElement>("#btn-descargar")!;
const estadoAvisosEl = document.querySelector<HTMLElement>("#estado-avisos")!;
const estadoDescargaEl = document.querySelector<HTMLElement>("#estado-descarga")!;
const progresoEl = document.querySelector<HTMLProgressElement>("#progreso-descarga")!;

function pintarEstadoAvisos() {
  const permiso = estadoAvisos();
  btnAvisos.disabled = permiso !== "default";
  estadoAvisosEl.textContent =
    permiso === "granted" ? "Avisos activos."
    : permiso === "denied" ? "Avisos bloqueados (cámbialo en la configuración del sitio)."
    : permiso === "no-soportado" ? "Este navegador no soporta notificaciones."
    : "Avisos sin activar.";
}
pintarEstadoAvisos();

btnAvisos.addEventListener("click", async () => {
  // El permiso se pide AQUÍ, dentro del clic.
  const permiso = await pedirPermisoAvisos();
  if (permiso === "granted") await mostrarAviso("Avisos activados", "Te avisaremos cuando las fichas estén listas.");
  pintarEstadoAvisos();
});

function pintarProgreso(hechos: number, total: number) {
  progresoEl.hidden = false;
  progresoEl.max = total;
  progresoEl.value = hechos;
  estadoDescargaEl.textContent = hechos >= total ? `✓ ${hechos} de ${total} fichas guardadas: ya puedes consultarlas sin conexión.` : `Descargando… ${hechos} de ${total} fichas.`;
}

// El SW informa el avance (y el final) a todas las ventanas abiertas.
navigator.serviceWorker?.addEventListener("message", async (e) => {
  if (e.data?.tipo === "progreso") pintarProgreso(e.data.hechos, e.data.total);
  if (e.data?.tipo === "descarga-completa") {
    await dbLista;
    await refrescarDescargados();
    render();
  }
});

btnDescargar.addEventListener("click", async () => {
  await dbLista;
  await encolarDescargas(db, MODELOS_IDS);
  pintarProgreso(0, MODELOS_IDS.length);
  btnDescargar.disabled = true;
  try {
    let enSegundoPlano = false;
    if ("serviceWorker" in navigator && "SyncManager" in window) {
      try {
        const reg = await navigator.serviceWorker.ready;
        await (reg as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } }).sync.register(ETIQUETA_SYNC);
        enSegundoPlano = true;
        estadoDescargaEl.textContent = "Descarga solicitada: el navegador la completará en cuanto haya conexión.";
      } catch {
        // Tener SyncManager no basta: register() falla (NotAllowedError) si el
        // usuario bloqueó la sincronización en segundo plano para este sitio.
        enSegundoPlano = false;
      }
    }
    if (!enSegundoPlano) {
      // Plan B (Safari, Firefox, o permiso denegado): se descarga desde la página, con la pestaña abierta.
      await descargarPendientes(db, pintarProgreso);
      await refrescarDescargados();
      render();
    }
  } catch (err) {
    estadoDescargaEl.textContent = "No se pudo completar la descarga: " + (err instanceof Error ? err.message : String(err));
  } finally {
    btnDescargar.disabled = false;
  }
});

// Instalación: appinstalled se dispara cuando el usuario instala la PWA.
window.addEventListener("appinstalled", () => {
  void mostrarAviso("Atlas 3D instalado", "Ya puedes abrirlo desde tu pantalla de inicio.", "/", "atlas-instalado");
});

// Registro del Service Worker — Sesión 34. Desde la Sesión 37 el archivo es
// src/sw.ts (escrito a mano); registerSW() sigue igual.
registerSW({
  immediate: true,
  onOfflineReady() {
    // Primera vez que el precaché quedó completo.
    estadoDescargaEl.textContent = "✓ La app ya funciona sin conexión.";
    // El usuario está mirando la pantalla: la notificación solo si NO la está mirando.
    if (document.visibilityState !== "visible") {
      void mostrarAviso("Atlas 3D listo", "Ya funciona sin conexión.", "/", "atlas-offline");
    }
  },
  onRegisteredSW(swUrl, registration) {
    console.log("SW de Workbox registrado:", swUrl, registration);
  },
  onRegisterError(error) {
    console.error("Error al registrar el SW de Workbox:", error);
  },
});
