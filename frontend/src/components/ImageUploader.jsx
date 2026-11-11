import { lerImagem } from "../api/client.js";

/**
 * Carrega a imagem inicial. A partir dela o App mantém uma CÓPIA DE
 * TRABALHO que acumula as edições aplicadas (ver useHistorico.js).
 */
export default function ImageUploader({ temImagem, onCarregar }) {
  async function handleArquivo(e) {
    const arquivo = e.target.files?.[0];
    e.target.value = ""; // permite escolher o mesmo arquivo de novo
    if (!arquivo) return;
    onCarregar(await lerImagem(arquivo));
  }

  return (
    <div style={{ border: "1px dashed var(--border)", borderRadius: 4, padding: 16, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <label
        style={{ background: "var(--bg-panel-raised)", border: "1px solid var(--border)", borderRadius: 3,
                 padding: "8px 16px", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer" }}
      >
        {temImagem ? "Carregar outra imagem" : "Carregar imagem"}
        <input type="file" accept="image/*" onChange={handleArquivo} style={{ display: "none" }} />
      </label>
      <span style={{ color: temImagem ? "var(--text-muted)" : "var(--text-faint)", fontSize: 13 }}>
        {temImagem
          ? "As edições são feitas numa cópia; a imagem enviada fica guardada para reverter."
          : "nenhuma imagem selecionada ainda"}
      </span>
    </div>
  );
}
