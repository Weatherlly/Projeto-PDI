/**
 * historico.js
 * ------------
 * Lógica PURA do histórico de edições (sem React), para poder ser testada
 * isoladamente. O hook useHistorico.js só guarda este estado num useState.
 *
 * Modelo: uma lista de estados (imagens) e um índice apontando para o atual.
 *
 *   estados: [E0, E1, E2, E3]      indice: 2   ->  imagem atual = E2
 *             ^ original   ^ refazer ainda possível (E3)
 *
 *   desfazer : indice - 1          refazer : indice + 1
 *   aplicar  : descarta o "futuro" (E3), acrescenta o novo estado
 *
 * Limite: guarda o estado inicial + as últimas `limite` mudanças, então dá
 * para desfazer até `limite` vezes. Ao estourar, os mais antigos são descartados.
 *
 * Cada estado é { base64, mime, rotulo }.
 */

export const LIMITE_MIN = 1;
export const LIMITE_MAX = 100;
export const LIMITE_PADRAO = 20;

export function criar(limite = LIMITE_PADRAO) {
  return { estados: [], indice: -1, limite: limiteValido(limite), original: null };
}

export function limiteValido(n) {
  const inteiro = Math.round(Number(n));
  if (!Number.isFinite(inteiro)) return LIMITE_PADRAO;
  return Math.min(LIMITE_MAX, Math.max(LIMITE_MIN, inteiro));
}

/** Ajusta a lista ao limite: primeiro descarta os mais antigos (sem passar do atual), depois o "refazer" mais distante. */
function cortar(estados, indice, limite) {
  const maximo = limite + 1;
  if (estados.length <= maximo) return { estados, indice };
  const descartarInicio = Math.min(estados.length - maximo, indice);
  let novos = estados.slice(descartarInicio);
  const novoIndice = indice - descartarInicio;
  if (novos.length > maximo) novos = novos.slice(0, maximo);
  return { estados: novos, indice: novoIndice };
}

/** Nova imagem enviada: recomeça o histórico (o limite configurado é mantido). */
export function carregar(estado, imagem) {
  return {
    ...estado,
    estados: [{ ...imagem, rotulo: "Imagem original" }],
    indice: 0,
    original: { ...imagem },
  };
}

/** Grava uma edição como novo passo do histórico. */
export function aplicar(estado, imagem, rotulo) {
  if (estado.indice < 0) return estado;
  const lista = [...estado.estados.slice(0, estado.indice + 1), { ...imagem, rotulo }];
  const cortado = cortar(lista, lista.length - 1, estado.limite);
  return { ...estado, ...cortado };
}

export function desfazer(estado) {
  return estado.indice > 0 ? { ...estado, indice: estado.indice - 1 } : estado;
}

export function refazer(estado) {
  return estado.indice < estado.estados.length - 1 ? { ...estado, indice: estado.indice + 1 } : estado;
}

/** Salta direto para um passo da lista. */
export function irPara(estado, i) {
  return i >= 0 && i < estado.estados.length ? { ...estado, indice: i } : estado;
}

/** Volta à imagem enviada, como uma edição (portanto também pode ser desfeita). */
export function reverterOriginal(estado) {
  const atual = estado.estados[estado.indice];
  if (!estado.original || !atual || atual.base64 === estado.original.base64) return estado;
  return aplicar(estado, estado.original, "Reverter ao original");
}

export function definirLimite(estado, novoLimite) {
  const limite = limiteValido(novoLimite);
  const cortado = cortar(estado.estados, estado.indice, limite);
  return { ...estado, limite, ...cortado };
}

// --- consultas ---
export const atual = (e) => (e.indice >= 0 ? e.estados[e.indice] : null);
export const podeDesfazer = (e) => e.indice > 0;
export const podeRefazer = (e) => e.indice >= 0 && e.indice < e.estados.length - 1;
export const temEdicoes = (e) => e.estados.length > 1;
export const urlDaImagem = (img) => (img ? `data:${img.mime};base64,${img.base64}` : null);
