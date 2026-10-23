// sensores.ts — orientación del dispositivo para el Atlas 3D (Sesión 35).
// Es la versión tipada del enfoque de la Sesión 25 (sensores.js del Gestor):
// mismo permiso de iOS, misma comprobación de "¿hay sensores de verdad?".
// Cambia lo que se hace con la lectura: aquí rota el visor 3D.

export type EstadoPermiso = "granted" | "denied" | "no-necesario" | "no-soportado";

// TypeScript no conoce requestPermission (solo existe en iOS/Safari): se declara.
type EventoConPermiso = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

/** En iOS se debe llamar desde un gesto del usuario (un clic). */
export async function pedirPermisoOrientacion(): Promise<EstadoPermiso> {
  if (!("DeviceOrientationEvent" in window)) return "no-soportado";
  const Evento = DeviceOrientationEvent as EventoConPermiso;
  if (typeof Evento.requestPermission === "function") {
    try {
      return await Evento.requestPermission();
    } catch {
      return "denied";
    }
  }
  return "no-necesario";
}

/** Un portátil dispara un evento con todo en null, o ninguno: espera una lectura real. */
export function hayOrientacionReal(timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const alRecibir = (e: DeviceOrientationEvent) => {
      if (e.beta !== null) {
        limpiar();
        resolve(true);
      }
    };
    const limpiar = () => {
      window.removeEventListener("deviceorientation", alRecibir);
      clearTimeout(t);
    };
    const t = setTimeout(() => {
      limpiar();
      resolve(false);
    }, timeoutMs);
    window.addEventListener("deviceorientation", alRecibir);
  });
}

export interface ControlOrientacion {
  /** La posición actual del teléfono pasa a ser la "neutra" (rotación 0). */
  calibrar(): void;
  detener(): void;
}

const GRADOS_A_RAD = Math.PI / 180;
const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Convierte la inclinación del teléfono en una rotación (en radianes) para el visor.
 * Se mide RELATIVA a una posición de referencia (la primera lectura, o la que fije
 * calibrar()): nadie sostiene el teléfono exactamente a 0°.
 */
export function iniciarControlOrientacion(
  onRotacion: (rotX: number, rotY: number) => void,
  intervaloMs = 33
): ControlOrientacion {
  let referencia: { beta: number; gamma: number } | null = null;
  let ultimaLectura: { beta: number; gamma: number } | null = null;
  let ultimoAviso = 0;

  const manejador = (e: DeviceOrientationEvent) => {
    if (e.beta === null || e.gamma === null) return;
    ultimaLectura = { beta: e.beta, gamma: e.gamma };
    if (!referencia) referencia = { ...ultimaLectura };
    const ahora = performance.now();
    if (ahora - ultimoAviso < intervaloMs) return; // ~30 avisos/s bastan
    ultimoAviso = ahora;
    // beta (adelante/atrás) → giro en X; gamma (izquierda/derecha) → giro en Y.
    const dBeta = limitar(e.beta - referencia.beta, -90, 90);
    const dGamma = limitar(e.gamma - referencia.gamma, -90, 90);
    onRotacion(dBeta * GRADOS_A_RAD, dGamma * GRADOS_A_RAD);
  };

  window.addEventListener("deviceorientation", manejador);
  return {
    calibrar() {
      referencia = ultimaLectura ? { ...ultimaLectura } : null;
      onRotacion(0, 0); // el visor vuelve a neutro de inmediato, sin esperar otra lectura
    },
    detener() {
      window.removeEventListener("deviceorientation", manejador);
    },
  };
}
