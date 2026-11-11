import { useState } from "react";
import { intensidadeApi } from "../api/client.js";
import ImageCompare from "./ImageCompare.jsx";
import { Botao, Campo, Erro, Linha, Nota, SeletorOperacao, SliderNumerico, estiloEntrada, useOperacao } from "./ui.jsx";

const OPERACOES = [
  { id: "negativo", rotulo: "Negativo" },
  { id: "limiarizacao", rotulo: "Limiarização" },
  { id: "brilho", rotulo: "Brilho" },
  { id: "gama", rotulo: "Correção de gama" },
  { id: "linear", rotulo: "Linear por partes" },
];

/** Transformações de intensidade. Backend: intensity.py (cinza e cor). */
export default function IntensityPanel({ imagemBase64, previewUrl, onCommit }) {
  const [operacao, setOperacao] = useState("negativo");
  const [limiar, setLimiar] = useState(128);
  const [delta, setDelta] = useState(30);
  const [gama, setGama] = useState(1.0);
  const [pontos, setPontos] = useState("0,0; 100,50; 200,220; 255,255");
  const op = useOperacao(imagemBase64, onCommit);

  function previsualizar() {
    switch (operacao) {
      case "negativo":
        return op.executar(() => intensidadeApi.negativo(imagemBase64), undefined, "Negativo");
      case "limiarizacao":
        return op.executar(() => intensidadeApi.limiarizacao(imagemBase64, limiar), undefined, `Limiarização (${limiar})`);
      case "brilho":
        return op.executar(() => intensidadeApi.brilho(imagemBase64, delta), undefined, `Brilho (${delta > 0 ? "+" : ""}${delta})`);
      case "gama":
        return op.executar(() => intensidadeApi.gama(imagemBase64, gama), undefined, `Gama (${gama})`);
      case "linear": {
        const parseados = pontos.split(";").map((par) => {
          const [r, s] = par.trim().split(",").map(Number);
          return { r, s };
        });
        if (parseados.some((p) => !Number.isFinite(p.r) || !Number.isFinite(p.s))) {
          return op.setErro("Pontos inválidos. Use o formato: 0,0; 100,50; 255,255");
        }
        return op.executar(() => intensidadeApi.linearPorPartes(imagemBase64, parseados), undefined, "Linear por partes");
      }
      default:
    }
  }

  return (
    <div>
      <SeletorOperacao opcoes={OPERACOES} valor={operacao} onChange={setOperacao} />

      <Linha>
        {operacao === "limiarizacao" && (
          <SliderNumerico label="Limiar" valor={limiar} onChange={setLimiar} min={0} max={255} />
        )}
        {operacao === "brilho" && (
          <SliderNumerico label="Delta" valor={delta} onChange={setDelta} min={-255} max={255} />
        )}
        {operacao === "gama" && (
          <SliderNumerico label="Gama" valor={gama} onChange={setGama} min={0.1} max={4} step={0.05} limiteMin={0.01} limiteMax={25} />
        )}
        {operacao === "linear" && (
          <Campo label="Pontos de controle (r,s; r,s; ...)">
            <input type="text" value={pontos} onChange={(e) => setPontos(e.target.value)} style={{ ...estiloEntrada, width: 300 }} />
          </Campo>
        )}
        <Botao primario onClick={previsualizar}>Pré-visualizar</Botao>
      </Linha>

      <Erro mensagem={op.erro} />
      <ImageCompare previewUrl={previewUrl} {...op.comparacao} nomeArquivo={`${operacao}.png`} />
      {operacao === "gama" && <Nota>Gama &lt; 1 clareia a imagem; gama &gt; 1 escurece.</Nota>}
    </div>
  );
}
