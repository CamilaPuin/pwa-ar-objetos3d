import "./estilos.css";
import { ControladorVisor } from "./controlador/ControladorVisor";

const listaEl = document.querySelector("#lista-catalogo");
const lienzoEl = document.querySelector("#lienzo-3d");
const descripcionEl = document.querySelector("#descripcion-patron");

const controlador = new ControladorVisor(listaEl, lienzoEl, descripcionEl);
controlador.iniciar();