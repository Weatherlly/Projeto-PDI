import { useState } from "react";

/**
 * Exibe a imagem original e a imagem processada lado a lado, como um
 * "contact sheet" de câmara escura. Usado por todos os painéis.
 *
 * Props opcionais:
 *   onOriginalClick(x, y) : torna a original clicável; recebe a posição
 *                           em PIXELS da imagem (não da tela). Usado para
 *                           escolher o pivô da rotação.
 *   marcador {x, y}       : desenha uma mira sobre a original nessa posição.
 *   nomeArquivo           : nome sugerido ao baixar a prévia.
 *   onAplicar/onDescartar : quando há prévia, mostram os botões "Aplicar na
 *                           imagem" (grava a edição no histórico) e "Descartar".
 *
 * A esquerda é a imagem ATUAL (a cópia de trabalho, com as edições já aplicadas);
 * a direita é só uma PRÉVIA: não altera nada até o usuário aplicar.
 */
export default function ImageCompare({
  previewUrl,
  resultadoBase64,
  carregando,
  onOriginalClick,
  marcador,
  nomeArquivo = "resultado.png",
  onAplicar,
  onDescartar,
}) {
  const [tamanhoOriginal, setTamanhoOriginal] = useState(null);
  const [tamanhoResultado, setTamanhoResultado] = useState(null);

  function handleCliqueOriginal(e) {
    if (!onOriginalClick) return;
    const img = e.currentTarget;
    const caixa = img.getBoundingClientRect();
    const x = ((e.clientX - caixa.left) / caixa.width) * img.naturalWidth;
    const y = ((e.clientY - caixa.top) / caixa.height) * img.naturalHeight;
    onOriginalClick(Math.round(x), Math.round(y));
  }

  const dimOriginal = tamanhoOriginal && `${tamanhoOriginal.w} × ${tamanhoOriginal.h} px`;
  const dimResultado = tamanhoResultado && resultadoBase64 && `${tamanhoResultado.w} × ${tamanhoResultado.h} px`;

  return (
    <div style={{ marginTop: 16 }}>
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      <Painel titulo="imagem atual" detalhe={dimOriginal}>
        {previewUrl && (
          <div style={{ position: "relative", display: "inline-block", lineHeight: 0 }}>
            <img
              src={previewUrl}
              alt="imagem atual"
              style={{ ...imgStyle, cursor: onOriginalClick ? "crosshair" : "default" }}
              onClick={handleCliqueOriginal}
              onLoad={(e) => setTamanhoOriginal({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
            />
            {marcador && tamanhoOriginal && (
              <Mira
                esquerda={(marcador.x / tamanhoOriginal.w) * 100}
                topo={(marcador.y / tamanhoOriginal.h) * 100}
              />
            )}
          </div>
        )}
      </Painel>

      <Painel
        titulo="prévia"
        detalhe={dimResultado}
        acao={
          resultadoBase64 && (
            <a
              href={`data:image/png;base64,${resultadoBase64}`}
              download={nomeArquivo}
              style={{ color: "var(--accent)", fontSize: 11, fontFamily: "var(--font-mono)" }}
            >
              baixar png
            </a>
          )
        }
      >
        {carregando ? (
          <span style={{ color: "var(--text-faint)", fontSize: 13 }}>processando…</span>
        ) : resultadoBase64 ? (
          <img
            src={`data:image/png;base64,${resultadoBase64}`}
            alt="prévia da edição"
            style={imgStyle}
            onLoad={(e) => setTamanhoResultado({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
          />
        ) : (
          <span style={{ color: "var(--text-faint)", fontSize: 13 }}>
            clique em Pré-visualizar para ver como ficaria
          </span>
        )}
      </Painel>
    </div>

    {resultadoBase64 && !carregando && onAplicar && (
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <button
          onClick={onAplicar}
          style={{ background: "var(--accent)", border: "none", borderRadius: 3, color: "#16140f",
                   padding: "8px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
        >
          Aplicar na imagem
        </button>
        <button
          onClick={onDescartar}
          style={{ background: "var(--bg-panel-raised)", border: "1px solid var(--border)", borderRadius: 3,
                   color: "var(--text)", padding: "8px 14px", fontSize: 13, cursor: "pointer" }}
        >
          Descartar prévia
        </button>
        <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
          A prévia ainda não alterou a imagem atual.
        </span>
      </div>
    )}
    </div>
  );
}

function Painel({ titulo, detalhe, acao, children }) {
  return (
    <div style={{ flex: "1 1 320px", minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--text-faint)",
          marginBottom: 6,
        }}
      >
        <span>
          {titulo}
          {detalhe && <span style={{ marginLeft: 8, color: "var(--text-muted)" }}>{detalhe}</span>}
        </span>
        {acao}
      </div>
      <div
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          minHeight: 260,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 8,
          overflow: "auto",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Mira (cruz com círculo) posicionada em porcentagem sobre a imagem. */
function Mira({ esquerda, topo }) {
  const traco = { position: "absolute", background: "var(--accent)", pointerEvents: "none" };
  return (
    <>
      <span style={{ ...traco, left: `${esquerda}%`, top: 0, bottom: 0, width: 1 }} />
      <span style={{ ...traco, top: `${topo}%`, left: 0, right: 0, height: 1 }} />
      <span
        style={{
          position: "absolute",
          left: `${esquerda}%`,
          top: `${topo}%`,
          width: 14,
          height: 14,
          marginLeft: -7,
          marginTop: -7,
          border: "2px solid var(--accent)",
          borderRadius: "50%",
          pointerEvents: "none",
        }}
      />
    </>
  );
}

const imgStyle = {
  maxWidth: "100%",
  maxHeight: 360,
  imageRendering: "pixelated",
  display: "block",
};
