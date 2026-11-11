import { useEffect, useRef, useState } from "react";

/**
 * Peças de interface compartilhadas pelos painéis: visual consistente,
 * slider com campo numérico e o hook useOperacao (prévia -> aplicar).
 */

export const estiloEntrada = {
  background: "var(--bg-panel-raised)",
  border: "1px solid var(--border)",
  borderRadius: 3,
  padding: "6px 10px",
  fontFamily: "var(--font-mono)",
  fontSize: 13,
};

export function Botao({ primario = false, ativo = false, children, style, ...props }) {
  const destacado = primario || ativo;
  return (
    <button
      {...props}
      style={{
        background: destacado ? "var(--accent)" : "var(--bg-panel-raised)",
        color: destacado ? "#16140f" : "var(--text)",
        border: primario ? "none" : "1px solid var(--border)",
        borderRadius: 3,
        padding: primario ? "8px 18px" : "6px 12px",
        fontSize: 13,
        fontWeight: destacado ? 600 : 400,
        opacity: props.disabled ? 0.45 : 1,
        cursor: props.disabled ? "not-allowed" : "pointer",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/** Barra de botões para escolher uma operação entre várias. */
export function SeletorOperacao({ opcoes, valor, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
      {opcoes.map((op) => (
        <Botao key={op.id} ativo={valor === op.id} onClick={() => onChange(op.id)}>
          {op.rotulo}
        </Botao>
      ))}
    </div>
  );
}

export function Campo({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>{label}</span>
      {children}
    </div>
  );
}

export function Linha({ children }) {
  return <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>{children}</div>;
}

export function Erro({ mensagem }) {
  if (!mensagem) return null;
  return (
    <p role="alert" style={{ color: "var(--error)", fontSize: 13, margin: "12px 0 0" }}>
      {mensagem}
    </p>
  );
}

export function Nota({ children }) {
  return (
    <p style={{ color: "var(--text-faint)", fontSize: 12, margin: "12px 0 0", maxWidth: 640, lineHeight: 1.5 }}>
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Slider + campo de texto
// ---------------------------------------------------------------------------

/**
 * Slider acompanhado de um campo de texto, para ajuste fino.
 *
 *  - Arrastar o slider atualiza o campo; digitar no campo move o slider.
 *  - Setas ↑/↓ no campo somam/subtraem `step` (Shift = 10x).
 *  - Ao sair do campo (ou Enter), o valor é limitado ao intervalo permitido.
 *  - `limiteMin/limiteMax` permitem digitar valores além do alcance do
 *    slider (útil quando o slider é curto para o ajuste fino).
 */
export function SliderNumerico({
  label, valor, onChange, min, max, step = 1, limiteMin = min, limiteMax = max, sufixo = "", largura = 150,
}) {
  const casas = (String(step).split(".")[1] || "").length;
  const formatar = (v) => Number(v).toFixed(casas);
  const limitar = (n) => Math.min(limiteMax, Math.max(limiteMin, n));
  const arredondar = (n) => (casas === 0 ? Math.round(n) : Number(n.toFixed(Math.max(casas, 2))));

  const [texto, setTexto] = useState(formatar(valor));
  const [focado, setFocado] = useState(false);

  // Mantém o campo em dia com o slider (e com mudanças externas), exceto durante a digitação.
  useEffect(() => {
    if (!focado) setTexto(formatar(valor));
  }, [valor, focado]); // eslint-disable-line react-hooks/exhaustive-deps

  function aoDigitar(e) {
    const t = e.target.value;
    setTexto(t);
    const n = Number(t.replace(",", "."));
    if (t.trim() !== "" && Number.isFinite(n) && n >= limiteMin && n <= limiteMax) onChange(arredondar(n));
  }

  function confirmar() {
    const n = Number(texto.replace(",", "."));
    if (texto.trim() === "" || !Number.isFinite(n)) {
      setTexto(formatar(valor));
    } else {
      const final = arredondar(limitar(n));
      onChange(final);
      setTexto(formatar(final));
    }
    setFocado(false);
  }

  function aoTeclar(e) {
    if (e.key === "Enter") return e.currentTarget.blur();
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const passo = (e.shiftKey ? 10 : 1) * step * (e.key === "ArrowUp" ? 1 : -1);
      const novo = arredondar(limitar(Number(valor) + passo));
      onChange(novo);
      setTexto(formatar(novo));
    }
  }

  return (
    <Campo label={label}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={Math.min(max, Math.max(min, Number(valor)))}
          onChange={(e) => onChange(arredondar(Number(e.target.value)))}
          style={{ width: largura }}
        />
        <input
          type="text"
          inputMode="decimal"
          aria-label={`${label} (valor)`}
          value={texto}
          onChange={aoDigitar}
          onFocus={(e) => { setFocado(true); e.target.select(); }}
          onBlur={confirmar}
          onKeyDown={aoTeclar}
          style={{ ...estiloEntrada, width: 68, textAlign: "right", padding: "4px 8px" }}
        />
        {sufixo && <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-faint)" }}>{sufixo}</span>}
      </div>
    </Campo>
  );
}

// ---------------------------------------------------------------------------
// useOperacao: prévia -> aplicar
// ---------------------------------------------------------------------------

/**
 * Estado comum de uma operação remota, com o fluxo PRÉVIA -> APLICAR:
 *
 *   executar(chamada, extrair, rotulo)  calcula e mostra a PRÉVIA (a imagem
 *                                       atual não muda)
 *   confirmar()                         grava a prévia como nova edição, via
 *                                       onCommit(base64, rotulo)
 *   descartar()                         joga a prévia fora
 *
 * A prévia é descartada sozinha sempre que a imagem atual muda (aplicar,
 * desfazer, refazer, nova imagem), e respostas atrasadas de uma imagem
 * antiga são ignoradas.
 *
 * `comparacao` já traz as props que o <ImageCompare> espera.
 */
export function useOperacao(imagemBase64, onCommit) {
  const [resultado, setResultado] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const rotulo = useRef("Edição");
  const versao = useRef(0);

  useEffect(() => {
    versao.current += 1;
    setResultado(null);
    setErro(null);
    setCarregando(false);
  }, [imagemBase64]);

  async function executar(chamada, extrairResultado = (r) => r.imagem_base64, rotuloEdicao = "Edição") {
    if (!imagemBase64) {
      setErro("Carregue uma imagem primeiro.");
      return null;
    }
    const minhaVersao = versao.current;
    setErro(null);
    setCarregando(true);
    try {
      const resposta = await chamada();
      if (minhaVersao !== versao.current) return null; // a imagem mudou enquanto esperávamos
      rotulo.current = rotuloEdicao;
      setResultado(extrairResultado(resposta));
      return resposta;
    } catch (e) {
      if (minhaVersao === versao.current) setErro(e.message);
      return null;
    } finally {
      if (minhaVersao === versao.current) setCarregando(false);
    }
  }

  function confirmar() {
    if (resultado && onCommit) onCommit(resultado, rotulo.current);
  }

  function descartar() {
    setResultado(null);
  }

  return {
    resultado,
    setResultado,
    carregando,
    erro,
    setErro,
    executar,
    confirmar,
    descartar,
    comparacao: {
      resultadoBase64: resultado,
      carregando,
      onAplicar: resultado && onCommit ? confirmar : undefined,
      onDescartar: resultado ? descartar : undefined,
    },
  };
}
