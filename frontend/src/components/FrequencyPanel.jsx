import { useEffect, useRef, useState } from "react";
import { frequenciaApi } from "../api/client.js";
import ImageCompare from "./ImageCompare.jsx";
import SpectrumEditor from "./SpectrumEditor.jsx";
import { Botao, Campo, Erro, Linha, Nota, SliderNumerico, estiloEntrada, useOperacao } from "./ui.jsx";

const METODOS = [
  { id: "fft", rotulo: "FFT própria (radix-2)" },
  { id: "dft", rotulo: "DFT ingênua própria" },
  { id: "numpy", rotulo: "FFT da biblioteca (NumPy)" },
];

const FERRAMENTAS = [
  { id: "preto", rotulo: "Preto (remove)" },
  { id: "branco", rotulo: "Branco (restaura)" },
  { id: "cinza", rotulo: "Cinza (atenua)" },
];

/**
 * Fluxo: calcular espectro -> pintar a máscara sobre ele -> aplicar
 * (multiplica o espectro pela máscara e faz a transformada inversa).
 * Backend: fourier.py
 */
export default function FrequencyPanel({ imagemBase64, previewUrl, onCommit }) {
  const editor = useRef(null);
  const [metodo, setMetodo] = useState("fft");
  const [espectro, setEspectro] = useState(null); // { base64, largura, altura }
  const [ferramenta, setFerramenta] = useState("preto");
  const [tamanho, setTamanho] = useState(40);
  const [suavidade, setSuavidade] = useState(0.6);
  const [nivelCinza, setNivelCinza] = useState(128);
  const [espelhar, setEspelhar] = useState(true);
  const [raioCirculo, setRaioCirculo] = useState(30);
  const [tempos, setTempos] = useState({});
  const op = useOperacao(imagemBase64, onCommit);

  // O espectro pertence à imagem em que foi calculado: ao mudar a imagem, precisa ser recalculado.
  useEffect(() => {
    setEspectro(null);
    setTempos({});
  }, [imagemBase64]);

  async function calcularEspectro() {
    const resp = await op.executar(
      () => frequenciaApi.espectro(imagemBase64, metodo),
      () => null
    );
    if (resp) {
      setEspectro({ base64: resp.espectro_base64, largura: resp.largura, altura: resp.altura });
      setTempos({ espectro: resp.tempo_ms });
    }
  }

  async function aplicar() {
    const mascara = editor.current?.obterMascaraBase64();
    if (!mascara) return;
    const resp = await op.executar(() => frequenciaApi.filtrar(imagemBase64, mascara, metodo), undefined,
      "Filtro no domínio da frequência");
    if (resp) setTempos((t) => ({ ...t, filtragem: resp.tempo_ms }));
  }

  return (
    <div>
      <Linha>
        <Campo label="Método da transformada">
          <select value={metodo} onChange={(e) => setMetodo(e.target.value)} style={estiloEntrada}>
            {METODOS.map((m) => (
              <option key={m.id} value={m.id}>{m.rotulo}</option>
            ))}
          </select>
        </Campo>
        <Botao primario onClick={calcularEspectro}>
          Calcular espectro
        </Botao>
        {tempos.espectro !== undefined && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)", paddingBottom: 8 }}>
            espectro: {tempos.espectro} ms
            {tempos.filtragem !== undefined && ` · filtragem: ${tempos.filtragem} ms`}
          </span>
        )}
      </Linha>

      <Erro mensagem={op.erro} />

      {espectro && (
        <div style={{ marginTop: 20, display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 320px", minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)", marginBottom: 6 }}>
              espectro deslocado (escala log) {espectro.largura} × {espectro.altura} — pinte para editar
            </div>
            <SpectrumEditor
              ref={editor}
              espectroBase64={espectro.base64}
              largura={espectro.largura}
              altura={espectro.altura}
              ferramenta={ferramenta}
              tamanho={tamanho}
              suavidade={suavidade}
              nivelCinza={nivelCinza}
              espelhar={espelhar}
            />
          </div>

          <div style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", gap: 14 }}>
            <Campo label="Pincel">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {FERRAMENTAS.map((f) => (
                  <Botao key={f.id} ativo={ferramenta === f.id} onClick={() => setFerramenta(f.id)}>
                    {f.rotulo}
                  </Botao>
                ))}
              </div>
            </Campo>

            {ferramenta === "cinza" && (
              <SliderNumerico label={`Nível de cinza (multiplicador ${(nivelCinza / 255).toFixed(2)})`}
                valor={nivelCinza} onChange={setNivelCinza} min={0} max={255} />
            )}
            <SliderNumerico label="Tamanho do pincel" valor={tamanho} onChange={setTamanho}
              min={4} max={200} limiteMax={600} sufixo="px" />
            <SliderNumerico label="Suavidade da borda" valor={Math.round(suavidade * 100)}
              onChange={(v) => setSuavidade(v / 100)} min={0} max={100} sufixo="%" />
            <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={espelhar} onChange={(e) => setEspelhar(e.target.checked)} />
              espelhar no lado oposto (simetria)
            </label>

            <SliderNumerico label="Filtro circular rápido: raio" valor={raioCirculo} onChange={setRaioCirculo}
              min={2} max={Math.floor(espectro.largura / 2)} sufixo="px" />
            <div style={{ display: "flex", gap: 6 }}>
              <Botao onClick={() => editor.current?.preencherCirculo(raioCirculo, "passa-baixa")}>Passa-baixa</Botao>
              <Botao onClick={() => editor.current?.preencherCirculo(raioCirculo, "passa-alta")}>Passa-alta</Botao>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <Botao primario onClick={aplicar}>
                Pré-visualizar filtro
              </Botao>
              <Botao onClick={() => editor.current?.limpar()}>Limpar máscara</Botao>
            </div>
          </div>
        </div>
      )}

      <ImageCompare
        previewUrl={previewUrl}
        {...op.comparacao}
        nomeArquivo="filtrada-frequencia.png"
      />

      <Nota>
        O centro do espectro é a frequência zero (brilho médio); frequências baixas (variações suaves) ficam
        perto do centro e as altas (bordas, ruído) nas extremidades. Apagar o centro remove as variações
        suaves (passa-alta); manter só o centro desfoca a imagem (passa-baixa); riscar pontos isolados
        remove padrões periódicos (notch). O espectro tem lados em potência de 2 porque a imagem é
        preenchida com zeros para a FFT radix-2; a DFT ingênua está limitada a 1024 px de lado.
      </Nota>
    </div>
  );
}
