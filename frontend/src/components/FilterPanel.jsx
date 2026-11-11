import { useState } from "react";
import { filtrosApi } from "../api/client.js";
import ImageCompare from "./ImageCompare.jsx";
import { Botao, Campo, Erro, Linha, Nota, SeletorOperacao, SliderNumerico, estiloEntrada, useOperacao } from "./ui.jsx";

const OPERACOES = [
  { id: "generico", rotulo: "Convolução (kernel livre)" },
  { id: "media", rotulo: "Média" },
  { id: "gaussiano", rotulo: "Gaussiano" },
  { id: "mediana", rotulo: "Mediana" },
  { id: "laplaciano", rotulo: "Laplaciano" },
  { id: "high-boost", rotulo: "High-Boost" },
];

const TAMANHOS = [3, 5, 7, 9, 11, 13, 15];

const PRESETS = {
  Identidade: (n) => matriz(n, (i, j) => (i === (n >> 1) && j === (n >> 1) ? 1 : 0)),
  Média: (n) => matriz(n, () => Number((1 / (n * n)).toFixed(4))),
  Realce: (n) => matriz(n, (i, j) => {
    const c = n >> 1;
    if (i === c && j === c) return 5;
    return (i === c && Math.abs(j - c) === 1) || (j === c && Math.abs(i - c) === 1) ? -1 : 0;
  }),
  Laplaciano: (n) => matriz(n, (i, j) => (i === (n >> 1) && j === (n >> 1) ? -(n * n - 1) : 1)),
  Zerar: (n) => matriz(n, () => 0),
};

function matriz(n, f) {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => f(i, j)));
}

/**
 * Filtragem espacial. Backend: filters.py (usa convolution.py).
 * "Convolução (kernel livre)": o usuário escolhe o tamanho (ímpar) e edita os pesos.
 */
export default function FilterPanel({ imagemBase64, previewUrl, onCommit }) {
  const [operacao, setOperacao] = useState("generico");
  const [tamanho, setTamanho] = useState(3);
  const [sigma, setSigma] = useState("");
  const [variante, setVariante] = useState("4-conexo");
  const [k, setK] = useState(1.5);
  const [kernel, setKernel] = useState(PRESETS.Média(3));
  const [normalizar, setNormalizar] = useState(true);
  const op = useOperacao(imagemBase64, onCommit);

  function mudarTamanho(n) {
    setTamanho(n);
    // preserva os pesos que cabem na grade nova; o resto começa em 0
    const antigo = kernel.length;
    const deslocamento = (n >> 1) - (antigo >> 1);
    setKernel(matriz(n, (i, j) => kernel[i - deslocamento]?.[j - deslocamento] ?? 0));
  }

  function editarCelula(i, j, valor) {
    setKernel(kernel.map((linha, a) => linha.map((c, b) => (a === i && b === j ? valor : c))));
  }

  function previsualizar() {
    switch (operacao) {
      case "generico": {
        const numerico = kernel.map((l) => l.map((c) => Number(String(c).replace(",", "."))));
        if (numerico.some((l) => l.some((c) => !Number.isFinite(c)))) return op.setErro("O kernel tem células vazias ou inválidas.");
        return op.executar(() => filtrosApi.generico(imagemBase64, numerico, normalizar), undefined, `Convolução ${tamanho}x${tamanho}`);
      }
      case "media":
        return op.executar(() => filtrosApi.media(imagemBase64, tamanho), undefined, `Média ${tamanho}x${tamanho}`);
      case "gaussiano": {
        const s = sigma === "" ? undefined : Number(sigma);
        return op.executar(() => filtrosApi.gaussiano(imagemBase64, tamanho, s), undefined, `Gaussiano ${tamanho}x${tamanho}`);
      }
      case "mediana":
        return op.executar(() => filtrosApi.mediana(imagemBase64, tamanho), undefined, `Mediana ${tamanho}x${tamanho}`);
      case "laplaciano":
        return op.executar(() => filtrosApi.laplaciano(imagemBase64, variante), undefined, `Laplaciano (${variante})`);
      case "high-boost":
        return op.executar(() => filtrosApi.highBoost(imagemBase64, tamanho, k), undefined, `High-boost ${tamanho}x${tamanho}, k=${k}`);
      default:
    }
  }

  const usaTamanho = operacao !== "laplaciano";

  return (
    <div>
      <SeletorOperacao opcoes={OPERACOES} valor={operacao} onChange={setOperacao} />

      <Linha>
        {usaTamanho && (
          <Campo label="Tamanho do kernel (ímpar)">
            <select value={tamanho} onChange={(e) => (operacao === "generico" ? mudarTamanho(Number(e.target.value)) : setTamanho(Number(e.target.value)))} style={estiloEntrada}>
              {TAMANHOS.map((t) => (
                <option key={t} value={t}>{t} x {t}</option>
              ))}
            </select>
          </Campo>
        )}

        {operacao === "gaussiano" && (
          <Campo label="Sigma (vazio = automático)">
            <input type="text" inputMode="decimal" value={sigma} placeholder="auto"
              onChange={(e) => setSigma(e.target.value.replace(/[^0-9.,]/g, ""))} style={{ ...estiloEntrada, width: 90 }} />
          </Campo>
        )}

        {operacao === "laplaciano" && (
          <Campo label="Variante">
            <select value={variante} onChange={(e) => setVariante(e.target.value)} style={estiloEntrada}>
              <option value="4-conexo">4-conexo</option>
              <option value="8-conexo">8-conexo</option>
            </select>
          </Campo>
        )}

        {operacao === "high-boost" && (
          <SliderNumerico label="Fator k" valor={k} onChange={setK} min={1} max={5} step={0.1} limiteMin={0} limiteMax={20} />
        )}

        {operacao === "generico" && (
          <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center", paddingBottom: 6 }}>
            <input type="checkbox" checked={normalizar} onChange={(e) => setNormalizar(e.target.checked)} />
            normalizar para exibição
          </label>
        )}

        <Botao primario onClick={previsualizar}>Pré-visualizar</Botao>
      </Linha>

      {operacao === "generico" && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>modelos:</span>
            {Object.keys(PRESETS).map((nome) => (
              <Botao key={nome} onClick={() => setKernel(PRESETS[nome](tamanho))}>{nome}</Botao>
            ))}
          </div>
          <div role="group" aria-label="Pesos do kernel"
            style={{ display: "grid", gridTemplateColumns: `repeat(${tamanho}, 58px)`, gap: 4, overflowX: "auto", paddingBottom: 4 }}>
            {kernel.map((linha, i) =>
              linha.map((valor, j) => (
                <input key={`${i}-${j}`} type="text" inputMode="decimal" value={valor}
                  aria-label={`peso linha ${i + 1} coluna ${j + 1}`}
                  onChange={(e) => editarCelula(i, j, e.target.value)}
                  onFocus={(e) => e.target.select()}
                  style={{ ...estiloEntrada, width: 58, padding: "5px 4px", textAlign: "center", fontSize: 12 }} />
              ))
            )}
          </div>
        </div>
      )}

      <Erro mensagem={op.erro} />
      <ImageCompare previewUrl={previewUrl} {...op.comparacao} nomeArquivo={`${operacao}.png`} />
      <Nota>
        {operacao === "generico"
          ? "Kernels com pesos negativos (realce, laplaciano) geram valores abaixo de 0 e acima de 255; com 'normalizar' marcado a prévia é reescalada para 0–255 e fica acinzentada (para aplicar o efeito na imagem sem esse reescalonamento, desmarque 'normalizar': os valores são apenas limitados a 0–255). A imagem processada sempre tem o mesmo tamanho da original."
          : "Filtros de média, gaussiano e mediana aceitam kernels de 3x3 até 15x15."}
      </Nota>
    </div>
  );
}
