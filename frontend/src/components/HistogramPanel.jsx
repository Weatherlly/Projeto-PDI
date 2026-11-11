import { useEffect, useState } from "react";
import { histogramaApi } from "../api/client.js";
import ImageCompare from "./ImageCompare.jsx";
import { Botao, Erro, Nota, useOperacao } from "./ui.jsx";

const ROTULOS = { cinza: "cinza", r: "R (vermelho)", g: "G (verde)", b: "B (azul)", i: "I (intensidade)" };
const CORES = { cinza: "var(--text-muted)", r: "#c8503c", g: "#6f9f58", b: "#4f86c6", i: "var(--text)" };

/**
 * Histograma (cinza: 1 gráfico; colorida: R, G, B e I) e equalização.
 * Em imagens coloridas a equalização age só no canal I do HSI.
 * Backend: histogram.py (+ color.py para a equalização colorida).
 */
export default function HistogramPanel({ imagemBase64, previewUrl, onCommit }) {
  const op = useOperacao(imagemBase64, onCommit);
  const [antes, setAntes] = useState(null);
  const [depois, setDepois] = useState(null);

  // Histogramas descrevem a imagem em que foram calculados: ao mudar a imagem, ficam obsoletos.
  useEffect(() => {
    setAntes(null);
    setDepois(null);
  }, [imagemBase64]);

  async function calcular() {
    const resp = await op.executar(() => histogramaApi.calcular(imagemBase64), () => null);
    if (resp) {
      setAntes(resp.canais);
      setDepois(null);
    }
  }

  async function equalizar() {
    const resp = await op.executar(() => histogramaApi.equalizar(imagemBase64), undefined, "Equalização de histograma");
    if (!resp) return;
    const [h1, h2] = await Promise.all([
      histogramaApi.calcular(imagemBase64),
      histogramaApi.calcular(resp.imagem_base64),
    ]);
    setAntes(h1.canais);
    setDepois(h2.canais);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12 }}>
        <Botao onClick={calcular}>Calcular histograma</Botao>
        <Botao primario onClick={equalizar}>
          Pré-visualizar equalização
        </Botao>
      </div>

      <Erro mensagem={op.erro} />

      {antes && <Grupo titulo={depois ? "antes da equalização" : "histograma"} canais={antes} />}
      {depois && <Grupo titulo="depois da equalização" canais={depois} />}

      <ImageCompare
        previewUrl={previewUrl}
        {...op.comparacao}
        nomeArquivo="equalizada.png"
      />
      <Nota>
        Em imagens coloridas, equalizar R, G e B separadamente distorceria as cores; por isso a
        equalização é feita só no canal de intensidade (I) do espaço HSI, mantendo matiz e saturação.
      </Nota>
    </div>
  );
}

function Grupo({ titulo, canais }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)", marginBottom: 6 }}>
        {titulo}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        {Object.entries(canais).map(([nome, valores]) => (
          <Histograma key={nome} nome={nome} valores={valores} />
        ))}
      </div>
    </div>
  );
}

/** Histograma como barras SVG simples, sem dependências externas. */
function Histograma({ nome, valores }) {
  const largura = 512;
  const altura = 130;
  const maximo = Math.max(...valores, 1);
  const larguraBarra = largura / valores.length;

  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: CORES[nome], marginBottom: 4 }}>
        {ROTULOS[nome] || nome}
      </div>
      <svg
        width="100%"
        viewBox={`0 0 ${largura} ${altura}`}
        role="img"
        aria-label={`histograma ${ROTULOS[nome] || nome}`}
        style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 4, display: "block" }}
      >
        {valores.map((v, i) => {
          const h = (v / maximo) * (altura - 6);
          return (
            <rect
              key={i}
              x={i * larguraBarra}
              y={altura - h}
              width={Math.max(larguraBarra - 0.4, 0.5)}
              height={h}
              fill={CORES[nome]}
            />
          );
        })}
      </svg>
    </div>
  );
}
