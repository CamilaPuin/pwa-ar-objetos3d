// visor.ts — escena de Three.js del Atlas 3D (Sesiones 35-36).
// El catálogo real de modelos 3D todavía no existe, así que el visor muestra
// un CUBO DE PRUEBA: sirve para comprobar que los sensores mueven algo,
// sin inventar archivos .glb que no están en el proyecto.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface Visor {
  /** Fija la rotación objetivo del modelo (radianes). El visor la alcanza suavemente. */
  rotarHacia(rotX: number, rotY: number): void;
  /** true: los sensores mandan (se apaga el ratón/táctil). false: control manual. */
  controlPorSensores(activo: boolean): void;
  /** Rotación actual del modelo, en grados (para mostrarla en pantalla). */
  rotacionActualGrados(): { x: number; y: number };
  /** true: sin color de fondo (se ve el video detrás). false: fondo azul oscuro. */
  fondoTransparente(activo: boolean): void;
  destruir(): void;
}

export function crearVisor(contenedor: HTMLElement): Visor {
  const escena = new THREE.Scene();
  const COLOR_FONDO = new THREE.Color(0x0b1220);
  escena.background = COLOR_FONDO;

  const camara = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camara.position.set(0, 0, 4);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  contenedor.append(renderer.domElement);

  escena.add(new THREE.AmbientLight(0xffffff, 0.6));
  const luz = new THREE.DirectionalLight(0xffffff, 1.2);
  luz.position.set(3, 4, 5);
  escena.add(luz);

  const grupo = new THREE.Group();
  const cubo = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 1.6, 1.6),
    new THREE.MeshStandardMaterial({ color: 0xffcc29, roughness: 0.45 })
  );
  const aristas = new THREE.LineSegments(
    new THREE.EdgesGeometry(cubo.geometry),
    new THREE.LineBasicMaterial({ color: 0x0b1220 })
  );
  grupo.add(cubo, aristas);
  escena.add(grupo);

  const controles = new OrbitControls(camara, renderer.domElement);
  controles.enableDamping = true;

  let objetivoX = 0;
  let objetivoY = 0;
  let porSensores = false;

  function ajustarTamano() {
    const ancho = contenedor.clientWidth || 320;
    const alto = Math.round(ancho * 0.6);
    renderer.setSize(ancho, alto);
    camara.aspect = ancho / alto;
    camara.updateProjectionMatrix();
  }
  ajustarTamano();
  window.addEventListener("resize", ajustarTamano);

  let animacion = 0;
  function bucle() {
    animacion = requestAnimationFrame(bucle);
    if (porSensores) {
      // Interpolación: alcanza el objetivo poco a poco (filtra el temblor del sensor).
      grupo.rotation.x += (objetivoX - grupo.rotation.x) * 0.15;
      grupo.rotation.y += (objetivoY - grupo.rotation.y) * 0.15;
    }
    controles.update();
    renderer.render(escena, camara);
  }
  bucle();

  const aGrados = (r: number) => Math.round((r * 180) / Math.PI);
  return {
    rotarHacia(x, y) {
      objetivoX = x;
      objetivoY = y;
    },
    controlPorSensores(activo) {
      porSensores = activo;
      controles.enabled = !activo;
      if (!activo) grupo.rotation.set(0, 0, 0);
    },
    rotacionActualGrados() {
      return { x: aGrados(grupo.rotation.x), y: aGrados(grupo.rotation.y) };
    },
    fondoTransparente(activo) {
      escena.background = activo ? null : COLOR_FONDO;
    },
    destruir() {
      cancelAnimationFrame(animacion);
      window.removeEventListener("resize", ajustarTamano);
      controles.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
