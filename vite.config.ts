import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    VitePWA({
      // El manifest ya existe a mano desde la Sesión 27 (public/manifest.json,
      // enlazado en index.html) — aquí solo se gestiona el Service Worker.
      manifest: false,
      registerType: "autoUpdate",
      injectRegister: false, // registramos nosotros mismos en main.ts, con virtual:pwa-register

      // Sesión 37: de generateSW (Workbox escribe el SW) a injectManifest (TÚ
      // escribes src/sw.ts y el plugin solo le inyecta la lista de precaché).
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectManifest: {
        globPatterns: ["**/*.{html,js,css,png,json}"],
        // Las fichas de modelos NO se precachean: se descargan bajo demanda.
        // Sin esta línea, el patrón **/*.json las metería en el precaché y
        // la descarga «voluntaria» no tendría sentido.
        globIgnores: ["modelos/**"],
      },
    }),
  ],
});
