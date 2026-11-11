import { useState } from "react";
import { esteganografiaApi } from "../api/client.js";
import ImageCompare from "./ImageCompare.jsx";
import { Botao, Campo, Erro, Linha, Nota, estiloEntrada, useOperacao } from "./ui.jsx";

/** Esteganografia LSB. Backend: steganography.py (em cor, os 3 canais carregam bits). */
export default function SteganographyPanel({ imagemBase64, previewUrl, onCommit }) {
  const [mensagem, setMensagem] = useState("");
  const [revelada, setRevelada] = useState(null);
  const op = useOperacao(imagemBase64, onCommit);

  function esconder() {
    if (!mensagem) return op.setErro("Digite uma mensagem para esconder.");
    setRevelada(null);
    op.executar(() => esteganografiaApi.esconder(imagemBase64, mensagem), undefined, "Mensagem escondida");
  }

  async function revelar() {
    // Se há uma prévia ainda não aplicada, revela dela (permite conferir antes de aplicar).
    const alvo = op.resultado || imagemBase64;
    const resp = await op.executar(() => esteganografiaApi.revelar(alvo), () => op.resultado, "Mensagem escondida");
    if (resp) setRevelada(resp.mensagem || "(nenhuma mensagem encontrada nesta imagem)");
  }

  return (
    <div>
      <Linha>
        <Campo label="Mensagem a esconder">
          <input type="text" value={mensagem} onChange={(e) => setMensagem(e.target.value)}
            placeholder="digite o texto secreto" style={{ ...estiloEntrada, width: 320, padding: "8px 10px" }} />
        </Campo>
        <Botao primario onClick={esconder}>Pré-visualizar</Botao>
        <Botao onClick={revelar}>Revelar mensagem</Botao>
      </Linha>

      <Erro mensagem={op.erro} />

      {revelada !== null && (
        <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--bg-panel-raised)", border: "1px solid var(--border)",
                      borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 13 }}>
          <span style={{ color: "var(--text-muted)" }}>mensagem revelada: </span>
          {revelada}
        </div>
      )}

      <ImageCompare previewUrl={previewUrl} {...op.comparacao} nomeArquivo="com-mensagem.png" />
      <Nota>
        A mensagem fica nos bits menos significativos dos pixels. Depois de aplicá-la, evite editar a imagem
        (qualquer filtro ou ajuste destrói os bits) e salve em PNG, nunca JPEG, que comprime com perdas.
        "Revelar" lê a prévia, se houver, ou a imagem atual.
      </Nota>
    </div>
  );
}
