// crypto.ts — idéntico en sustancia a crypto.js de la Sesión 22 (Gestor de
// Tareas), solo tipado para este proyecto TypeScript. Sesión 33, sección 4:
// la misma clave y las mismas funciones de cifrado se reutilizan tal cual,
// sin resolver un segundo problema criptográfico.

export async function derivarClaveDesdeContrasena(contrasena: string, sal: Uint8Array): Promise<CryptoKey> {
  const materialBase = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(contrasena),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: sal as BufferSource, iterations: 100000, hash: "SHA-256" },
    materialBase,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function cifrarTexto(clave: CryptoKey, texto: string): Promise<{ cifrado: ArrayBuffer; iv: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const datos = new TextEncoder().encode(texto);
  const cifrado = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, clave, datos);
  return { cifrado, iv };
}

export async function descifrarTexto(clave: CryptoKey, { cifrado, iv }: { cifrado: ArrayBuffer; iv: Uint8Array }): Promise<string> {
  const datos = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, clave, cifrado);
  return new TextDecoder().decode(datos);
}

const CLAVE_SAL = "atlas3d-sal";

/** La sal no es secreta; se guarda en localStorage igual que en el Gestor de Tareas (Sesión 22). */
export function obtenerOCrearSal(): Uint8Array {
  const guardada = localStorage.getItem(CLAVE_SAL);
  if (guardada) {
    return Uint8Array.from(atob(guardada), (c) => c.charCodeAt(0));
  }
  const sal = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem(CLAVE_SAL, btoa(String.fromCharCode(...sal)));
  return sal;
}
