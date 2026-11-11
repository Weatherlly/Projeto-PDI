import { useEffect, useState } from "react";
import { arquivoParaBase64, coresApi, histogramaApi, intensidadeApi } from "../api/client.js";
import ImageCompare from "./ImageCompare.jsx";
import { Botao, Campo, Erro, Linha, Nota, SeletorOperacao, SliderNumerico, estiloEntrada, useOperacao } from "./ui.jsx";

const OPERACOES = [
  { id: "hsi", rotulo: "RGB ⇄ HSI" },
  { id: "cinza", rotulo: "Escala de cinza" },
  { id: "negativo", rotulo: "Negativo" },
  { id: "chroma", rotulo: "Chroma-key" },
  { id: "equalizar", rotulo: "Equalização (HSI)" },
  { id: "ajuste-hsi", rotulo: "Matiz / Saturação / Brilho" },
  { id: "canal", rotulo: "Ajuste de canal" },
  { id: "sepia", rotulo: "Sépia" },
];

const NOTAS = {
  hsi: "H (matiz, 0–360° mapeado para 0–255), S (saturação) e I (intensidade) aparecem como imagens em cinza. 'Voltar para RGB' reconstrói a imagem a partir delas; como os canais são guardados em 8 bits, o matiz perde cerca de 1,4° de precisão.",
  cinza: "Média simples: (R+G+B)/3, todos os canais com o mesmo peso. Ponderada: 0,299R + 0,587G + 0,114B, que reflete a maior sensibilidade do olho ao verde.",
  negativo: "Inverte cada canal: 255 − valor. Funciona igual em imagens coloridas e em cinza.",
  chroma: "Pixels cuja distância (em RGB, de 0 a ~441) até a cor-chave é menor ou igual ao valor escolhido são trocados pelo pixel correspondente da imagem de fundo, redimensionada para o tamanho da original.",
  equalizar: "Equaliza só o canal I do HSI; matiz e saturação ficam intactos, então as cores não se distorcem.",
  "ajuste-hsi": "Matiz gira as cores pelo círculo cromático (+120° leva o vermelho ao verde); saturação multiplica S (0 = cinza); brilho soma um valor a I.",
  canal: "RGB: soma o valor ao canal. CMY: como C = 255 − R, somar ao C equivale a subtrair do R (e analogamente M/G, Y/B).",
  sepia: "Cada pixel vira uma combinação linear fixa de R, G e B (matriz clássica de sépia), resultando em um cinza amarelado.",
};

function hexParaRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Backend: color.py (+ histogram.py / intensity.py para equalização e negativo). */
export default function ColorPanel({ imagemBase64, previewUrl, onCommit }) {
  const [operacao, setOperacao] = useState("hsi");
  const op = useOperacao(imagemBase64, onCommit);

  const [metodoCinza, setMetodoCinza] = useState("ponderada");
  const [hsiCanais, setHsiCanais] = useState(null);
  const [fundo, setFundo] = useState(null); // { base64, url }
  const [corChave, setCorChave] = useState("#00ff00");
  const [distancia, setDistancia] = useState(100);
  const [matiz, setMatiz] = useState(0);
  const [saturacao, setSaturacao] = useState(1);
  const [brilho, setBrilho] = useState(0);
  const [modeloCanal, setModeloCanal] = useState("rgb");
  const [deltas, setDeltas] = useState([0, 0, 0]);

  // Os canais H, S, I pertencem à imagem em que foram calculados.
  useEffect(() => setHsiCanais(null), [imagemBase64]);

  function trocarOperacao(id) {
    setOperacao(id);
    op.descartar();
    op.setErro(null);
  }

  async function carregarFundo(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setFundo({ base64: await arquivoParaBase64(arquivo), url: URL.createObjectURL(arquivo) });
  }

  async function converterParaHsi() {
    const resp = await op.executar(() => coresApi.rgbParaHsi(imagemBase64), () => null);
    if (resp) setHsiCanais(resp);
  }

  function voltarParaRgb() {
    if (!hsiCanais) return op.setErro("Converta para HSI primeiro.");
    op.executar(() => coresApi.hsiParaRgb(hsiCanais.h_base64, hsiCanais.s_base64, hsiCanais.i_base64), undefined,
      "HSI → RGB");
  }

  function aplicar() {
    switch (operacao) {
      case "cinza":
        return op.executar(() => coresApi.cinza(imagemBase64, metodoCinza), undefined,
          `Escala de cinza (${metodoCinza === "media" ? "média" : "ponderada"})`);
      case "negativo":
        return op.executar(() => intensidadeApi.negativo(imagemBase64), undefined, "Negativo");
      case "chroma":
        if (!fundo) return op.setErro("Escolha a imagem que vai substituir o fundo verde.");
        return op.executar(() => coresApi.chromaKey(imagemBase64, fundo.base64, hexParaRgb(corChave), distancia),
          undefined, `Chroma-key (distância ${distancia})`);
      case "equalizar":
        return op.executar(() => histogramaApi.equalizar(imagemBase64), undefined, "Equalização (HSI)");
      case "ajuste-hsi":
        return op.executar(() => coresApi.ajusteHsi(imagemBase64, matiz, saturacao, brilho), undefined,
          `Matiz ${matiz}°, sat ×${saturacao}, brilho ${brilho}`);
      case "canal":
        return op.executar(() => coresApi.ajusteCanal(imagemBase64, deltas, modeloCanal), undefined,
          `Ajuste de canal (${modeloCanal.toUpperCase()}: ${deltas.join(", ")})`);
      case "sepia":
        return op.executar(() => coresApi.sepia(imagemBase64), undefined, "Sépia");
      default:
    }
  }

  const rotulosCanal = modeloCanal === "rgb" ? ["R", "G", "B"] : ["C", "M", "Y"];
  const mostrarAplicar = operacao !== "hsi";

  return (
    <div>
      <SeletorOperacao opcoes={OPERACOES} valor={operacao} onChange={trocarOperacao} />

      <Linha>
        {operacao === "hsi" && (
          <>
            <Botao primario onClick={converterParaHsi}>Converter para HSI</Botao>
            <Botao onClick={voltarParaRgb} disabled={!hsiCanais}>Voltar para RGB</Botao>
          </>
        )}

        {operacao === "cinza" && (
          <Campo label="Algoritmo">
            <select value={metodoCinza} onChange={(e) => setMetodoCinza(e.target.value)} style={estiloEntrada}>
              <option value="media">Média aritmética simples</option>
              <option value="ponderada">Média ponderada</option>
            </select>
          </Campo>
        )}

        {operacao === "chroma" && (
          <>
            <Campo label="Cor-chave">
              <input type="color" value={corChave} onChange={(e) => setCorChave(e.target.value)}
                style={{ width: 56, height: 32, background: "none", border: "1px solid var(--border)" }} />
            </Campo>
            <SliderNumerico label="Distância da cor" valor={distancia} onChange={setDistancia} min={0} max={442} />
            <Campo label="Imagem de substituição">
              <label style={{ ...estiloEntrada, cursor: "pointer", fontFamily: "var(--font-display)" }}>
                {fundo ? "trocar imagem" : "escolher imagem"}
                <input type="file" accept="image/*" onChange={carregarFundo} style={{ display: "none" }} />
              </label>
            </Campo>
            {fundo && <img src={fundo.url} alt="fundo escolhido" style={{ height: 44, borderRadius: 3, border: "1px solid var(--border)" }} />}
          </>
        )}

        {operacao === "ajuste-hsi" && (
          <>
            <SliderNumerico label="Matiz" valor={matiz} onChange={setMatiz} min={-180} max={180} step={0.5}
              limiteMin={-360} limiteMax={360} sufixo="°" />
            <SliderNumerico label="Saturação (multiplicador)" valor={saturacao} onChange={setSaturacao}
              min={0} max={3} step={0.05} limiteMax={10} />
            <SliderNumerico label="Brilho" valor={brilho} onChange={setBrilho} min={-128} max={128} limiteMin={-255} limiteMax={255} />
          </>
        )}

        {operacao === "canal" && (
          <>
            <Campo label="Modelo">
              <select value={modeloCanal} onChange={(e) => setModeloCanal(e.target.value)} style={estiloEntrada}>
                <option value="rgb">RGB (R, G, B)</option>
                <option value="cmy">CMY (C, M, Y)</option>
              </select>
            </Campo>
            {rotulosCanal.map((rotulo, i) => (
              <SliderNumerico key={rotulo} label={`Canal ${rotulo}`} valor={deltas[i]}
                onChange={(v) => setDeltas(deltas.map((d, j) => (j === i ? v : d)))} min={-255} max={255} />
            ))}
          </>
        )}

        {mostrarAplicar && (
          <Botao primario onClick={aplicar}>
            Pré-visualizar
          </Botao>
        )}
      </Linha>

      <Erro mensagem={op.erro} />

      <ImageCompare
        previewUrl={previewUrl}
        {...op.comparacao}
        nomeArquivo={`${operacao}.png`}
      />

      {operacao === "hsi" && hsiCanais && (
        <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          {[["h_base64", "H — matiz"], ["s_base64", "S — saturação"], ["i_base64", "I — intensidade"]].map(([chave, rotulo]) => (
            <figure key={chave} style={{ margin: 0, flex: "1 1 180px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)", marginBottom: 6 }}>
                {rotulo}
              </div>
              <img src={`data:image/png;base64,${hsiCanais[chave]}`} alt={rotulo}
                style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 4, display: "block" }} />
            </figure>
          ))}
        </div>
      )}

      <Nota>{NOTAS[operacao]}</Nota>
    </div>
  );
}
