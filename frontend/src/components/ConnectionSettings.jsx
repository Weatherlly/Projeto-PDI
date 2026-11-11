import { useState } from "react";
import { getBackendUrl, setBackendUrl, testarConexao } from "../api/client.js";

/**
 * Painel de configuração da URL do backend. Fica sempre visível no topo
 * da aplicação, pois a URL do Ngrok muda a cada sessão do Colab e o
 * usuário precisa poder trocá-la sem recompilar o front-end.
 */
export default function ConnectionSettings() {
  const [url, setUrl] = useState(getBackendUrl());
  const [status, setStatus] = useState(null); // null | 'testando' | 'ok' | 'erro'
  const [mensagem, setMensagem] = useState("");

  async function handleTestar() {
    setBackendUrl(url);
    setStatus("testando");
    const resultado = await testarConexao();
    setStatus(resultado.ok ? "ok" : "erro");
    setMensagem(resultado.mensagem);
  }

  const corStatus = { ok: "var(--ok)", erro: "var(--error)", testando: "var(--text-muted)" }[status];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 20px",
        background: "var(--bg-panel)",
        borderBottom: "1px solid var(--border)",
        fontFamily: "var(--font-mono)",
        fontSize: 13,
      }}
    >
      <span style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>URL do backend</span>
      <input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://xxxx-xx-xx-xx-xx.ngrok-free.app"
        style={{
          flex: 1,
          minWidth: 200,
          background: "var(--bg-panel-raised)",
          border: "1px solid var(--border)",
          borderRadius: 3,
          padding: "6px 10px",
          fontFamily: "var(--font-mono)",
          fontSize: 13,
        }}
      />
      <button
        onClick={handleTestar}
        style={{
          background: "var(--accent)",
          border: "none",
          borderRadius: 3,
          color: "#16140f",
          padding: "6px 14px",
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: 13,
        }}
      >
        Testar conexão
      </button>
      {status && (
        <span style={{ color: corStatus, whiteSpace: "nowrap" }}>
          {status === "testando" ? "verificando…" : mensagem}
        </span>
      )}
    </div>
  );
}
