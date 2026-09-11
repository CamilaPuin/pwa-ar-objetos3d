export type CategoriaPatron = "estructural" | "distribuida" | "datos";

export interface PatronArquitectura {
  id: string;
  nombre: string;
  categoria: CategoriaPatron;
  descripcion: string;
}