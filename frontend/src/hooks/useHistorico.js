import { useCallback, useState } from "react";
import * as H from "./historico.js";

const CHAVE_LIMITE = "mini-gimp-pdi:limite-historico";

function limiteSalvo() {
  try {
    const n = Number(localStorage.getItem(CHAVE_LIMITE));
    if (Number.isInteger(n) && n >= H.LIMITE_MIN && n <= H.LIMITE_MAX) return n;
  } catch {
    /* localStorage indisponível: usa o padrão */
  }
  return H.LIMITE_PADRAO;
}

/**
 * Hook do histórico de edições (undo/redo). Envolve as funções puras de
 * historico.js num useState e expõe a imagem atual e as ações.
 */
export function useHistorico() {
  const [estado, setEstado] = useState(() => H.criar(limiteSalvo()));

  const carregar = useCallback((imagem) => setEstado((e) => H.carregar(e, imagem)), []);
  const aplicar = useCallback((imagem, rotulo) => setEstado((e) => H.aplicar(e, imagem, rotulo)), []);
  const desfazer = useCallback(() => setEstado(H.desfazer), []);
  const refazer = useCallback(() => setEstado(H.refazer), []);
  const irPara = useCallback((i) => setEstado((e) => H.irPara(e, i)), []);
  const reverterOriginal = useCallback(() => setEstado(H.reverterOriginal), []);
  const definirLimite = useCallback((n) => {
    try {
      localStorage.setItem(CHAVE_LIMITE, String(H.limiteValido(n)));
    } catch {
      /* ignora */
    }
    setEstado((e) => H.definirLimite(e, n));
  }, []);

  const imagemAtual = H.atual(estado);

  return {
    estados: estado.estados,
    indice: estado.indice,
    limite: estado.limite,
    imagemAtual,
    previewUrl: H.urlDaImagem(imagemAtual),
    temImagem: imagemAtual !== null,
    podeDesfazer: H.podeDesfazer(estado),
    podeRefazer: H.podeRefazer(estado),
    temEdicoes: H.temEdicoes(estado),
    carregar,
    aplicar,
    desfazer,
    refazer,
    irPara,
    reverterOriginal,
    definirLimite,
  };
}
