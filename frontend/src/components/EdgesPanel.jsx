import { useState } from "react";
import { bordasApi } from "../api/client.js";
import ImageCompare from "./ImageCompare.jsx";
import { Botao, Erro, Nota, SeletorOperacao, useOperacao } from "./ui.jsx";

const OPERACOES = [
  { id: "sobel-x", rotulo: "Sobel X" },
  { id: "sobel-y", rotulo: "Sobel Y" },
  { id: "gradiente", rotulo: "Gradiente (magnitude)" },
];

const DESCRICOES = {
  "sobel-x": "Responde a variações horizontais de intensidade: realça bordas verticais. Valores negativos e positivos aparecem em lados opostos do cinza médio (que representa 'sem variação').",
  "sobel-y": "Responde a variações verticais de intensidade: realça bordas horizontais. Também normalizado, então o fundo liso fica em cinza médio.",
  gradiente: "Magnitude √(Gx² + Gy²): combina as duas direções, é sempre positiva e não depende da orientação da borda. Operação não linear.",
};

/** Backend: edges.py (usa convolution.py). Saídas normalizadas só para exibição. */
export default function EdgesPanel({ imagemBase64, previewUrl, onCommit }) {
  const [operacao, setOperacao] = useState("sobel-x");
  const op = useOperacao(imagemBase64, onCommit);

  function previsualizar() {
    const chamadas = {
      "sobel-x": bordasApi.sobelX,
      "sobel-y": bordasApi.sobelY,
      gradiente: bordasApi.gradiente,
    };
    const rotulos = { "sobel-x": "Sobel X", "sobel-y": "Sobel Y", gradiente: "Gradiente (magnitude)" };
    op.executar(() => chamadas[operacao](imagemBase64), undefined, rotulos[operacao]);
  }

  return (
    <div>
      <SeletorOperacao opcoes={OPERACOES} valor={operacao} onChange={setOperacao} />
      <Botao primario onClick={previsualizar}>
        Pré-visualizar
      </Botao>
      <Erro mensagem={op.erro} />
      <Nota>{DESCRICOES[operacao]}</Nota>
      <ImageCompare
        previewUrl={previewUrl}
        {...op.comparacao}
        nomeArquivo={`${operacao}.png`}
      />
    </div>
  );
}
