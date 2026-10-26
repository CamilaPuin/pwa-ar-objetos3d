// visor.ts — escena de Three.js del Atlas 3D (Sesiones 35-39).
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { crearGestos } from "./gestos";
import { capacidadesDe } from "./xr";
import type { CapacidadesAR } from "./xr";

export type FaseAR = "buscando" | "listo" | "colocado";

export interface EstadoAR extends CapacidadesAR {
  fase: FaseAR;
  anclado: boolean;
  escala: number;
  giroGrados: number;
  posicion: { x: number; y: number; z: number };
  consultas: number;
  resultados: number;
  impactos: number;
  sinSuperficie: boolean;
}

export interface OpcionesAR {
  overlay: HTMLElement;
  alCambiar: (estado: EstadoAR) => void;
  alTerminar: () => void;
}

export interface Visor {
  rotarHacia(rotX: number, rotY: number): void;
  controlPorSensores(activo: boolean): void;
  rotacionActualGrados(): { x: number; y: number };
  fondoTransparente(activo: boolean): void;
  entrarEnAR(sesion: XRSession, opciones: OpcionesAR): Promise<void>;
  quitarCubo(): void;
  enAR(): boolean;
  destruir(): void;
}

const ESCALA_INICIAL = 0.25;
const ESCALA_MIN = 0.1;
const ESCALA_MAX = 1;
const CADA_CUANTOS_FOTOGRAMAS = 2;
const MS_HASTA_PLAN_B = 6000;
const CONSULTAS_SIN_IMPACTO = 8;
const MITAD = 0.8;
const COLOR_RETICULA_HORIZONTAL = 0x4ade80;
const COLOR_RETICULA_VERTICAL = 0xffa726;

type XRFrameConAnclas = XRFrame & {
  createAnchor?: (pose: XRRigidTransform, espacio: XRSpace) => Promise<XRAnchor>;
  trackedAnchors?: Set<XRAnchor>;
};

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

  const raiz = new THREE.Group();
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
  raiz.add(grupo);
  escena.add(raiz);

  const controles = new OrbitControls(camara, renderer.domElement);
  controles.enableDamping = true;

  let objetivoX = 0;
  let objetivoY = 0;
  let porSensores = false;
  let sesionAR: XRSession | null = null;
  let quitarCuboActual: (() => void) | null = null;

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
      grupo.rotation.x += (objetivoX - grupo.rotation.x) * 0.15;
      grupo.rotation.y += (objetivoY - grupo.rotation.y) * 0.15;
    }
    controles.update();
    renderer.render(escena, camara);
  }
  bucle();

  async function entrarEnAR(sesion: XRSession, opciones: OpcionesAR): Promise<void> {
    cancelAnimationFrame(animacion);
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType("local");
    await renderer.xr.setSession(sesion);
    sesionAR = sesion;

    const fondoPrevio = escena.background;
    const posicionPrevia = grupo.position.clone();
    const escalaPrevia = grupo.scale.clone();
    const rotacionPrevia = grupo.rotation.clone();
    escena.background = null;
    controles.enabled = false;

    const capacidades = capacidadesDe(sesion);

    let fase: FaseAR = capacidades.hitTest ? "buscando" : "colocado";
    let ancla: XRAnchor | null = null;
    let escala = ESCALA_INICIAL;
    let consultas = 0;
    let resultados = 0;
    let impactosVistos = 0;
    let sinSuperficie = false;
    let ultimaSuperficie = performance.now();
    let ultimoImpacto: XRRigidTransform | null = null;
    let impactoHorizontal = false;
    let sinImpacto = 0;
    let cuadro = 0;
    let turno = 0;

    raiz.matrixAutoUpdate = false;
    raiz.visible = !capacidades.hitTest;
    raiz.matrix.makeTranslation(0, -0.5, -1.5);
    grupo.position.set(0, MITAD * escala, 0);
    grupo.scale.setScalar(escala);
    grupo.rotation.set(0, 0, 0);

    const estado = (): EstadoAR => {
      raiz.updateMatrixWorld(true);
      const p = grupo.getWorldPosition(new THREE.Vector3());
      const giro = ((THREE.MathUtils.radToDeg(grupo.rotation.y) % 360) + 360) % 360;
      return {
        ...capacidades,
        fase,
        anclado: ancla !== null,
        escala,
        giroGrados: Math.round(giro) % 360,
        posicion: { x: p.x, y: p.y, z: p.z },
        consultas,
        resultados,
        impactos: impactosVistos,
        sinSuperficie,
      };
    };
    const avisar = () => opciones.alCambiar(estado());

    let fuente: XRHitTestSource | null = null;
    if (capacidades.hitTest) {
      try {
        const espacioViewer = await sesion.requestReferenceSpace("viewer");
        try {
          fuente = await sesion.requestHitTestSource?.({
            space: espacioViewer,
            entityTypes: ["plane", "point"],
          }) ?? null;
        } catch {
          fuente = await sesion.requestHitTestSource?.({ space: espacioViewer }) ?? null;
        }
      } catch (error) {
        console.warn("No se pudo preparar hit-test; se usará el plan B:", error);
      }
      if (!fuente) {
        capacidades.hitTest = false;
        fase = "colocado";
        raiz.visible = true;
        raiz.matrix.makeTranslation(0, -0.5, -1.5);
      }
    }

    const reticula = new THREE.Mesh(
      new THREE.RingGeometry(0.1, 0.13, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: COLOR_RETICULA_HORIZONTAL })
    );
    reticula.matrixAutoUpdate = false;
    reticula.visible = false;
    escena.add(reticula);

    const destruirAncla = () => {
      turno++;
      ancla?.delete();
      ancla = null;
    };

    function quitarCubo() {
      destruirAncla();
      raiz.visible = false;
      fase = fuente ? (reticula.visible && impactoHorizontal ? "listo" : "buscando") : "buscando";
      avisar();
    }
    quitarCuboActual = quitarCubo;

    async function colocar(frame: XRFrame) {
      const referencia = renderer.xr.getReferenceSpace();
      if (!referencia) return;
      const mio = ++turno;
      let impacto: XRRigidTransform | null = null;
      const hayImpacto = fuente !== null && reticula.visible && impactoHorizontal && ultimoImpacto !== null;
      if (fuente && !hayImpacto && !sinSuperficie) return;

      if (hayImpacto) {
        impacto = ultimoImpacto;
        raiz.matrix.copy(reticula.matrix);
      } else {
        const posicion = camara.getWorldPosition(new THREE.Vector3());
        const delante = camara.getWorldDirection(new THREE.Vector3()).setY(0);
        if (delante.lengthSq() === 0) delante.set(0, 0, -1);
        else delante.normalize();
        posicion.addScaledVector(delante, 1.5);
        posicion.y -= 0.5;
        raiz.matrix.makeTranslation(posicion.x, posicion.y, posicion.z);
      }

      grupo.position.set(0, MITAD * escala, 0);
      raiz.visible = true;
      fase = "colocado";
      ancla?.delete();
      ancla = null;
      avisar();

      const crear = (frame as XRFrameConAnclas).createAnchor;
      if (impacto && capacidades.anclas && crear) {
        try {
          const nueva = await crear.call(frame, impacto, referencia);
          if (mio !== turno || sesionAR !== sesion) nueva.delete();
          else ancla = nueva;
        } catch (error) {
          ancla = null;
          console.warn("No se pudo crear un ancla; el cubo queda colocado sin seguimiento:", error);
        }
        avisar();
      }
    }

    const rayo = new THREE.Raycaster();
    const plano = new THREE.Plane();
    const normal = new THREE.Vector3();
    const puntoCentro = new THREE.Vector3();
    const desfase = new THREE.Vector2();
    const gestos = crearGestos(opciones.overlay, {
      alMover(x, y, primero) {
        if (fase !== "colocado") return;
        const coordenadas = new THREE.Vector2(
          (x / window.innerWidth) * 2 - 1,
          -(y / window.innerHeight) * 2 + 1
        );
        normal.set(0, 1, 0);
        rayo.setFromCamera(coordenadas, camara);
        raiz.updateMatrixWorld(true);
        normal.transformDirection(raiz.matrixWorld);
        puntoCentro.setFromMatrixPosition(raiz.matrixWorld);
        plano.setFromNormalAndCoplanarPoint(normal, puntoCentro);
        const punto = rayo.ray.intersectPlane(plano, new THREE.Vector3());
        if (!punto) return;
        const local = raiz.worldToLocal(punto);
        if (primero) {
          desfase.set(grupo.position.x - local.x, grupo.position.z - local.z);
        }
        grupo.position.x = local.x + desfase.x;
        grupo.position.z = local.z + desfase.y;
        avisar();
      },
      alGirar(radianes) {
        if (fase !== "colocado") return;
        grupo.rotation.y += radianes;
        avisar();
      },
      alEscalar(factor) {
        if (fase !== "colocado") return;
        escala = Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, escala * factor));
        grupo.scale.setScalar(escala);
        grupo.position.y = MITAD * escala;
        avisar();
      },
    });

    const alSeleccionar = (evento: Event) => {
      if (gestos.huboGesto()) return;
      void colocar((evento as XRInputSourceEvent).frame);
    };
    sesion.addEventListener("select", alSeleccionar);

    renderer.setAnimationLoop((_tiempo, frame) => {
      const referencia = renderer.xr.getReferenceSpace();
      if (frame && referencia) {
        const frameAR = frame as XRFrameConAnclas;
        if (fuente && cuadro++ % CADA_CUANTOS_FOTOGRAMAS === 0) {
          const impactos = frame.getHitTestResults(fuente);
          const pose = impactos.length ? impactos[0].getPose(referencia) : null;
          consultas++;
          if (impactos.length) resultados++;
          if (pose) impactosVistos++;
          if (consultas % 30 === 0) avisar();

          if (pose) {
            sinImpacto = 0;
            sinSuperficie = false;
            ultimaSuperficie = performance.now();
            reticula.visible = true;
            reticula.matrix.fromArray(pose.transform.matrix);
            ultimoImpacto = pose.transform;
            const matriz = pose.transform.matrix;
            impactoHorizontal = Math.abs(matriz[5]) > 0.8;
            (reticula.material as THREE.MeshBasicMaterial).color.set(
              impactoHorizontal ? COLOR_RETICULA_HORIZONTAL : COLOR_RETICULA_VERTICAL
            );
            if (fase !== "colocado") {
              fase = impactoHorizontal ? "listo" : "buscando";
              avisar();
            }
          } else if (++sinImpacto >= CONSULTAS_SIN_IMPACTO) {
            reticula.visible = false;
            ultimoImpacto = null;
            impactoHorizontal = false;
            if (fase !== "colocado" && fase === "listo") {
              fase = "buscando";
              avisar();
            }
          }

          if (
            !pose &&
            fase !== "colocado" &&
            !sinSuperficie &&
            performance.now() - ultimaSuperficie > MS_HASTA_PLAN_B
          ) {
            sinSuperficie = true;
            avisar();
          }
        }
        if (ancla && frameAR.trackedAnchors?.has(ancla)) {
          const poseAncla = frame.getPose(ancla.anchorSpace, referencia);
          if (poseAncla) raiz.matrix.fromArray(poseAncla.transform.matrix);
        }
      }
      renderer.render(escena, camara);
    });

    sesion.addEventListener(
      "end",
      () => {
        turno++;
        renderer.setAnimationLoop(null);
        renderer.xr.enabled = false;
        sesion.removeEventListener("select", alSeleccionar);
        sesionAR = null;
        quitarCuboActual = null;
        gestos.destruir();
        fuente?.cancel();
        ancla?.delete();
        ancla = null;
        escena.remove(reticula);
        reticula.geometry.dispose();
        (reticula.material as THREE.Material).dispose();
        escena.background = fondoPrevio;
        controles.enabled = !porSensores;
        raiz.matrixAutoUpdate = true;
        raiz.matrix.identity();
        raiz.visible = true;
        grupo.position.copy(posicionPrevia);
        grupo.scale.copy(escalaPrevia);
        grupo.rotation.copy(rotacionPrevia);
        ajustarTamano();
        bucle();
        opciones.alTerminar();
      },
      { once: true }
    );
    avisar();
  }

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
    entrarEnAR,
    quitarCubo() {
      quitarCuboActual?.();
    },
    enAR() {
      return sesionAR !== null;
    },
    destruir() {
      cancelAnimationFrame(animacion);
      void sesionAR?.end();
      window.removeEventListener("resize", ajustarTamano);
      controles.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      cubo.geometry.dispose();
      (cubo.material as THREE.Material).dispose();
      aristas.geometry.dispose();
      (aristas.material as THREE.Material).dispose();
    },
  };
}
