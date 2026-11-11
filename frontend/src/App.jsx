import { useEffect, useState } from "react";
import ConnectionSettings from "./components/ConnectionSettings.jsx";
import ImageUploader from "./components/ImageUploader.jsx";
import BarraHistorico from "./components/BarraHistorico.jsx";
import IntensityPanel from "./components/IntensityPanel.jsx";
import SteganographyPanel from "./components/SteganographyPanel.jsx";
import HistogramPanel from "./components/HistogramPanel.jsx";
import FilterPanel from "./components/FilterPanel.jsx";
import EdgesPanel from "./components/EdgesPanel.jsx";
import GeometryPanel from "./components/GeometryPanel.jsx";
import FrequencyPanel from "./components/FrequencyPanel.jsx";
import ColorPanel from "./components/ColorPanel.jsx";
import { useHistorico } from "./hooks/useHistorico.js";

// Cada módulo aqui corresponde 1:1 a um arquivo do backend — mapeamento
// proposital, para deixar claro na apresentação qual tela usa qual implementação.
const MODULOS = [
  { id: "intensidade", rotulo: "Intensidade", arquivo: "intensity.py", Componente: IntensityPanel },
  { id: "esteganografia", rotulo: "Esteganografia", arquivo: "steganography.py", Componente: SteganographyPanel },
  { id: "histograma", rotulo: "Histograma", arquivo: "histogram.py", Componente: HistogramPanel },
  { id: "filtros", rotulo: "Filtros espaciais", arquivo: "filters.py + convolution.py", Componente: FilterPanel },
  { id: "bordas", rotulo: "Bordas", arquivo: "edges.py", Componente: EdgesPanel },
  { id: "geometria", rotulo: "Escala e rotação", arquivo: "geometry.py", Componente: GeometryPanel },
  { id: "frequencia", rotulo: "Frequência", arquivo: "fourier.py", Componente: FrequencyPanel },
  { id: "cores", rotulo: "Cores", arquivo: "color.py", Componente: ColorPanel },
];

/** Em campos de texto, Ctrl+Z deve desfazer a digitação, não a edição da imagem. */
function digitandoTexto(el) {
  if (!el) return false;
  if (el.isContentEditable || el.tagName === "TEXTAREA") return true;
  if (el.tagName !== "INPUT") return false;
  return !["range", "checkbox", "radio", "color", "button", "file"].includes(el.type);
}

export default function App() {
  const [moduloAtivo, setModuloAtivo] = useState("intensidade");
  const historico = useHistorico();
  const { desfazer, refazer } = historico;

  // Atalhos: Ctrl/Cmd+Z desfaz; Ctrl/Cmd+Y ou Ctrl/Cmd+Shift+Z refaz.
  useEffect(() => {
    function aoTeclar(e) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || digitandoTexto(e.target)) return;
      const tecla = e.key.toLowerCase();
      if (tecla === "z" && !e.shiftKey) {
        e.preventDefault();
        desfazer();
      } else if (tecla === "y" || (tecla === "z" && e.shiftKey)) {
        e.preventDefault();
        refazer();
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [desfazer, refazer]);

  function handleCarregar(imagem) {
    if (historico.temEdicoes && !window.confirm("Carregar outra imagem descarta o histórico de edições atual. Continuar?")) return;
    historico.carregar(imagem);
  }

  const modulo = MODULOS.find((m) => m.id === moduloAtivo);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <ConnectionSettings />

      <header style={{ padding: "24px 32px 8px" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: -0.5 }}>
          Mini-GIMP <span style={{ color: "var(--accent)" }}>·</span> PDI
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 14, margin: "4px 0 0" }}>Processador de imagens — Trabalho 1</p>
      </header>

      <div style={{ padding: "0 32px 16px" }}>
        <ImageUploader temImagem={historico.temImagem} onCarregar={handleCarregar} />
      </div>

      {historico.temImagem && <BarraHistorico historico={historico} />}

      <nav style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "20px 32px 0", borderBottom: "1px solid var(--border)" }}>
        {MODULOS.map((m) => (
          <button
            key={m.id}
            onClick={() => setModuloAtivo(m.id)}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              borderBottom: m.id === moduloAtivo ? "2px solid var(--accent)" : "2px solid transparent",
              color: m.id === moduloAtivo ? "var(--text)" : "var(--text-muted)",
              padding: "10px 16px", fontSize: 14, fontWeight: m.id === moduloAtivo ? 600 : 400,
              display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2,
            }}
          >
            {m.rotulo}
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-faint)" }}>{m.arquivo}</span>
          </button>
        ))}
      </nav>

      <main style={{ flex: 1, padding: 32 }}>
        <modulo.Componente
          imagemBase64={historico.imagemAtual?.base64 ?? null}
          previewUrl={historico.previewUrl}
          onCommit={(base64, rotulo) => historico.aplicar({ base64, mime: "image/png" }, rotulo)}
        />
      </main>
    </div>
  );
}
