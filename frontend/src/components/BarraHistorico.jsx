import { LIMITE_MAX, LIMITE_MIN } from "../hooks/historico.js";
import { Botao, SliderNumerico } from "./ui.jsx";

/**
 * Barra de histórico: desfazer/refazer (Ctrl+Z / Ctrl+Y), limite de passos
 * configurável, reverter ao original, baixar a imagem atual e lista de passos.
 */
export default function BarraHistorico({ historico: h }) {
  const passoAtual = h.indice;
  const totalPassos = h.estados.length - 1;
  const baixarHref = h.imagemAtual && `data:${h.imagemAtual.mime};base64,${h.imagemAtual.base64}`;
  const extensao = h.imagemAtual?.mime === "image/jpeg" ? "jpg" : "png";

  return (
    <div style={{ padding: "12px 32px", borderBottom: "1px solid var(--border)", background: "var(--bg-panel)" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <Botao onClick={h.desfazer} disabled={!h.podeDesfazer} title="Desfazer (Ctrl+Z)">
          ↶ Desfazer
        </Botao>
        <Botao onClick={h.refazer} disabled={!h.podeRefazer} title="Refazer (Ctrl+Y ou Ctrl+Shift+Z)">
          Refazer ↷
        </Botao>

        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)", paddingBottom: 7, minWidth: 110 }}>
          passo {passoAtual} de {totalPassos}
        </span>

        <SliderNumerico
          label="Passos guardados (limite)"
          valor={h.limite}
          onChange={h.definirLimite}
          min={LIMITE_MIN}
          max={50}
          limiteMax={LIMITE_MAX}
          largura={110}
        />

        <Botao onClick={h.reverterOriginal} disabled={!h.temEdicoes}>
          Reverter ao original
        </Botao>
        <a
          href={baixarHref}
          download={`imagem-editada.${extensao}`}
          style={{ color: "var(--accent)", fontSize: 12, fontFamily: "var(--font-mono)", paddingBottom: 8 }}
        >
          baixar imagem atual
        </a>
      </div>

      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          histórico de edições ({h.estados.length})
        </summary>
        <ol style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 2, maxHeight: 180, overflow: "auto" }}>
          {h.estados.map((estado, i) => (
            <li key={i}>
              <button
                onClick={() => h.irPara(i)}
                aria-current={i === h.indice ? "step" : undefined}
                style={{
                  width: "100%", textAlign: "left", background: i === h.indice ? "var(--accent-dim)" : "transparent",
                  border: "none", borderRadius: 3, padding: "4px 8px", fontSize: 12, cursor: "pointer",
                  color: i > h.indice ? "var(--text-faint)" : "var(--text)", fontFamily: "var(--font-mono)",
                }}
              >
                {i}. {estado.rotulo}
                {i > h.indice && "  (desfeito)"}
              </button>
            </li>
          ))}
        </ol>
        <p style={{ fontSize: 11, color: "var(--text-faint)", margin: "6px 0 0", maxWidth: 560 }}>
          Cada passo guarda uma cópia da imagem na memória do navegador; com imagens grandes, prefira um limite menor.
        </p>
      </details>
    </div>
  );
}
