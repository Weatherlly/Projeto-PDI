import { useEffect, useState } from "react";
import { geometriaApi } from "../api/client.js";
import ImageCompare from "./ImageCompare.jsx";
import { Botao, Campo, Erro, Linha, Nota, SeletorOperacao, SliderNumerico, estiloEntrada, useOperacao } from "./ui.jsx";

const OPERACOES = [
  { id: "escala", rotulo: "Escala" },
  { id: "rotacao", rotulo: "Rotação" },
];

const CANVAS = [
  { id: "ajustar", rotulo: "Ajustar à imagem girada" },
  { id: "uniao", rotulo: "Original + girada (mostra o pivô)" },
  { id: "manter", rotulo: "Manter tamanho original" },
];

/**
 * Escala e rotação, com interpolação pelo vizinho mais próximo ou bilinear.
 * A rotação aceita pivô: clique na imagem original para escolhê-lo.
 * Backend: geometry.py
 */
export default function GeometryPanel({ imagemBase64, previewUrl, onCommit }) {
  const [operacao, setOperacao] = useState("escala");
  const [interpolacao, setInterpolacao] = useState("bilinear");
  const [sx, setSx] = useState(2);
  const [sy, setSy] = useState(2);
  const [proporcional, setProporcional] = useState(true);
  const [angulo, setAngulo] = useState(30);
  const [pivo, setPivo] = useState(null); // null = centro da imagem
  const [canvas, setCanvas] = useState("ajustar");
  const op = useOperacao(imagemBase64, onCommit);

  // O pivô é uma posição em pixels da imagem atual; se a imagem muda (outro tamanho), volta ao centro.
  useEffect(() => setPivo(null), [imagemBase64]);

  function mudarSx(valor) {
    setSx(valor);
    if (proporcional) setSy(valor);
  }

  function aplicar() {
    if (operacao === "escala") {
      const fx = Number(sx);
      const fy = Number(sy);
      if (!(fx > 0) || !(fy > 0)) return op.setErro("Os fatores de escala devem ser maiores que zero.");
      op.executar(() => geometriaApi.escala(imagemBase64, fx, fy, interpolacao), undefined,
        `Escala ${fx}×${fy} (${interpolacao})`);
    } else {
      op.executar(() => geometriaApi.rotacao(imagemBase64, Number(angulo), pivo, interpolacao, canvas), undefined,
        `Rotação ${angulo}° (${interpolacao})`);
    }
  }

  return (
    <div>
      <SeletorOperacao opcoes={OPERACOES} valor={operacao} onChange={setOperacao} />

      <Linha>
        <Campo label="Interpolação">
          <select value={interpolacao} onChange={(e) => setInterpolacao(e.target.value)} style={estiloEntrada}>
            <option value="vizinho">Vizinho mais próximo</option>
            <option value="bilinear">Bilinear</option>
          </select>
        </Campo>

        {operacao === "escala" && (
          <>
            <Campo label="Escala em x">
              <input type="number" min="0.05" step="0.1" value={sx} onChange={(e) => mudarSx(e.target.value)}
                style={{ ...estiloEntrada, width: 90 }} />
            </Campo>
            <Campo label="Escala em y">
              <input type="number" min="0.05" step="0.1" value={sy} disabled={proporcional}
                onChange={(e) => setSy(e.target.value)} style={{ ...estiloEntrada, width: 90 }} />
            </Campo>
            <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center", paddingBottom: 6 }}>
              <input type="checkbox" checked={proporcional} onChange={(e) => setProporcional(e.target.checked)} />
              manter proporção
            </label>
          </>
        )}

        {operacao === "rotacao" && (
          <>
            <SliderNumerico label="Ângulo (anti-horário)" valor={angulo} onChange={setAngulo}
              min={-180} max={180} step={0.5} limiteMin={-3600} limiteMax={3600} sufixo="°" />
            <Campo label="Tela do resultado">
              <select value={canvas} onChange={(e) => setCanvas(e.target.value)} style={estiloEntrada}>
                {CANVAS.map((c) => (
                  <option key={c.id} value={c.id}>{c.rotulo}</option>
                ))}
              </select>
            </Campo>
          </>
        )}

        <Botao primario onClick={aplicar}>
          Pré-visualizar
        </Botao>
      </Linha>

      {operacao === "rotacao" && (
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 14, fontSize: 13, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
            Pivô: {pivo ? `(${pivo.x}, ${pivo.y}) px` : "centro da imagem"}
          </span>
          <Botao onClick={() => setPivo(null)}>Usar o centro</Botao>
          {pivo && (
            <>
              <Campo label="x">
                <input type="number" value={pivo.x} onChange={(e) => setPivo({ ...pivo, x: Number(e.target.value) })}
                  style={{ ...estiloEntrada, width: 80 }} />
              </Campo>
              <Campo label="y">
                <input type="number" value={pivo.y} onChange={(e) => setPivo({ ...pivo, y: Number(e.target.value) })}
                  style={{ ...estiloEntrada, width: 80 }} />
              </Campo>
            </>
          )}
          <span style={{ color: "var(--text-faint)", fontSize: 12 }}>
            ou clique na imagem original para escolher o pivô
          </span>
        </div>
      )}

      <Erro mensagem={op.erro} />

      <ImageCompare
        previewUrl={previewUrl}
        {...op.comparacao}
        nomeArquivo={`${operacao}.png`}
        onOriginalClick={operacao === "rotacao" ? (x, y) => setPivo({ x, y }) : undefined}
        marcador={operacao === "rotacao" ? pivo : null}
      />

      <Nota>
        {operacao === "escala"
          ? "Vizinho mais próximo copia o pixel mais próximo (bordas serrilhadas, rápido); bilinear mistura os 4 vizinhos ponderando pela distância (transição suave). A diferença é bem visível ao ampliar."
          : "A imagem é rotacionada em torno do pivô. Pixels do resultado sem correspondente na original ficam pretos. Com 'Ajustar à imagem girada' o pivô só desloca o resultado; use 'Original + girada' ou 'Manter tamanho' para ver o efeito dele."}
      </Nota>
    </div>
  );
}
