// avisos.ts — notificaciones locales del Atlas 3D (Sesión 37).
// Misma regla que en la Sesión 26: el permiso se pide dentro de un clic, y
// una notificación solo se justifica cuando el usuario NO está mirando la app.

export type EstadoAvisos = NotificationPermission | "no-soportado";

export function estadoAvisos(): EstadoAvisos {
  return "Notification" in window ? Notification.permission : "no-soportado";
}

export async function pedirPermisoAvisos(): Promise<EstadoAvisos> {
  if (!("Notification" in window)) return "no-soportado";
  return Notification.requestPermission();
}

/** Muestra una notificación a través del Service Worker (funciona también en Android). */
export async function mostrarAviso(titulo: string, cuerpo: string, url = "/", tag = "atlas-aviso"): Promise<boolean> {
  if (estadoAvisos() !== "granted") return false;
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification(titulo, {
    body: cuerpo,
    icon: "/iconos/icon-192.png",
    tag,
    data: { url },
  });
  return true;
}
