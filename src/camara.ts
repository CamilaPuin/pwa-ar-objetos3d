// camara.ts — cámara del dispositivo como fondo del visor (Sesión 36).
// Los errores y constraints de getUserMedia se vieron a fondo en la Sesión 24;
// aquí solo cambia la DURACIÓN: la cámara queda abierta mientras se usa el visor.

export async function iniciarCamaraDeFondo(video: HTMLVideoElement): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  return stream;
}

export function detenerCamaraDeFondo(video: HTMLVideoElement, stream: MediaStream | null): void {
  stream?.getTracks().forEach((pista) => pista.stop());
  video.srcObject = null;
}

/** Traduce el error de getUserMedia a un mensaje que dice qué pasó y qué hacer. */
export function describirErrorCamara(err: unknown): string {
  const nombre = err instanceof Error ? err.name : "";
  switch (nombre) {
    case "NotAllowedError":
      return "Permiso de cámara denegado. Puedes cambiarlo en los ajustes del sitio del navegador.";
    case "NotFoundError":
      return "No se encontró ninguna cámara en este dispositivo.";
    case "NotReadableError":
      return "La cámara está en uso por otra aplicación. Ciérrala e inténtalo de nuevo.";
    case "SecurityError":
      return "El navegador tiene deshabilitado el acceso a la cámara en esta página.";
    case "TypeError":
      return "La cámara solo está disponible en páginas seguras (HTTPS o localhost).";
    default:
      return "No se pudo abrir la cámara. Revisa los permisos e inténtalo de nuevo.";
  }
}
