




/** Resultado de preguntar «¿puedo usar AR aquí?». */
export type SoporteAR = "disponible" | "contexto-inseguro" | "sin-webxr" | "sin-ar";

/** Estado de soporte y, además, las comprobaciones una por una (para mostrarlas en pantalla). */
export async function diagnosticarAR(): Promise<{ estado: SoporteAR; lineas: string[] }> {
  const lineas: string[] = [];
  const seguro = window.isSecureContext;
  lineas.push(`Contexto seguro (HTTPS o localhost): ${seguro ? "sí" : "NO"}`);
  if (!seguro) return { estado: "contexto-inseguro", lineas };

  lineas.push(`navigator.xr: ${navigator.xr ? "presente" : "AUSENTE"}`);
  if (!navigator.xr) return { estado: "sin-webxr", lineas };

  try {
    // Responde si el DISPOSITIVO puede abrir ese modo; no pide permiso ni abre nada.
    const ok = await navigator.xr.isSessionSupported("immersive-ar");
    lineas.push(`isSessionSupported("immersive-ar"): ${ok}`);
    return { estado: ok ? "disponible" : "sin-ar", lineas };
  } catch (err) {
    lineas.push(`isSessionSupported("immersive-ar") lanzó: ${err instanceof Error ? err.name : String(err)}`);
    return { estado: "sin-ar", lineas };
  }
}

export function mensajeSoporteAR(estado: SoporteAR): string {
  switch (estado) {
    case "disponible":
      return "Este dispositivo puede abrir una sesión de realidad aumentada.";
    case "contexto-inseguro":
      return "La realidad aumentada exige HTTPS o localhost.";
    case "sin-webxr":
      return "Este navegador no ofrece WebXR (por ejemplo, Safari en iPhone o Firefox). El visor 3D sigue funcionando.";
    case "sin-ar":
      return "Este dispositivo no admite realidad aumentada en el navegador (por ejemplo, un computador de escritorio sin el emulador activado).";
  }
}

export function pedirSesionAR(overlay: HTMLElement | null): Promise<XRSession> {
  const opciones: XRSessionInit & { domOverlay?: { root: Element } } = {
    requiredFeatures: ["local"], // el origen (0,0,0) es donde está el usuario al empezar
    optionalFeatures: ["dom-overlay"], // si existe, el botón «Salir» se dibuja sobre la cámara
  };
  if (overlay) opciones.domOverlay = { root: overlay };
  return navigator.xr!.requestSession("immersive-ar", opciones);
}

export function describirErrorAR(err: unknown): string {
  const nombre = err instanceof Error ? err.name : "";
  switch (nombre) {
    case "NotSupportedError":
      return "Este dispositivo no puede abrir realidad aumentada con las funciones que pide la app.";
    case "SecurityError":
      return "El navegador rechazó la sesión de realidad aumentada: se denegó el permiso o la petición no vino de un toque del usuario.";
    default:
      return "No se pudo iniciar la realidad aumentada. Inténtalo de nuevo.";
  }
}