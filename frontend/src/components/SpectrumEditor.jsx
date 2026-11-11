import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

/**
 * Editor do espectro de Fourier.
 *
 * Dois canvases trabalham juntos:
 *   - MÁSCARA (fora da tela): começa toda branca (= mantém tudo). O pincel
 *     pinta nela: preto zera a frequência, branco restaura, cinza atenua.
 *   - VISÍVEL: mostra  espectro × máscara  (blend "multiply"), ou seja,
 *     exatamente o espectro que será usado na transformada inversa.
 *
 * Só a máscara é enviada ao backend (mascara_base64). Seu tamanho é o do
 * espectro (potência de 2), que o backend informa junto com o espectro.
 *
 * Métodos expostos via ref: obterMascaraBase64(), limpar(), preencherCirculo().
 */
const SpectrumEditor = forwardRef(function SpectrumEditor(
  { espectroBase64, largura, altura, ferramenta, tamanho, suavidade, nivelCinza, espelhar },
  ref
) {
  const visivel = useRef(null);
  const mascara = useRef(null);
  const base = useRef(null);
  const desenhando = useRef(false);
  const ultimoPonto = useRef(null);
  const quadro = useRef(0);

  // Carrega o espectro e zera a máscara sempre que um novo espectro chega.
  useEffect(() => {
    const canvasMascara = document.createElement("canvas");
    canvasMascara.width = largura;
    canvasMascara.height = altura;
    const ctx = canvasMascara.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, largura, altura);
    mascara.current = canvasMascara;

    const img = new Image();
    img.onload = () => {
      base.current = img;
      redesenhar();
    };
    img.src = `data:image/png;base64,${espectroBase64}`;
  }, [espectroBase64, largura, altura]);

  function redesenhar() {
    const canvas = visivel.current;
    if (!canvas || !base.current || !mascara.current) return;
    const ctx = canvas.getContext("2d");
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(base.current, 0, 0);
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(mascara.current, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }

  function agendarRedesenho() {
    cancelAnimationFrame(quadro.current);
    quadro.current = requestAnimationFrame(redesenhar);
  }

  function valorDaFerramenta() {
    if (ferramenta === "preto") return 0;
    if (ferramenta === "branco") return 255;
    return Number(nivelCinza);
  }

  /** Um "carimbo" do pincel: círculo com gradiente radial (borda suave). */
  function carimbar(x, y) {
    const ctx = mascara.current.getContext("2d");
    const v = valorDaFerramenta();
    const raio = Number(tamanho) / 2;
    const interno = Math.min(raio - 0.5, raio * (1 - Number(suavidade)));
    const gradiente = ctx.createRadialGradient(x, y, Math.max(interno, 0), x, y, raio);
    gradiente.addColorStop(0, `rgba(${v},${v},${v},1)`);
    gradiente.addColorStop(1, `rgba(${v},${v},${v},0)`);
    ctx.fillStyle = gradiente;
    ctx.fillRect(x - raio, y - raio, raio * 2, raio * 2);
  }

  function carimbarComSimetria(x, y) {
    carimbar(x, y);
    if (espelhar) {
      // O espectro de uma imagem real é simétrico em relação ao centro
      // (frequência -f é o conjugado de +f). Pintar também o ponto oposto
      // mantém a imagem filtrada real, sem perder metade do efeito.
      // Pixel de índice i tem centro em i+0.5; o oposto de i é (largura - i).
      carimbar(largura - x + 1, altura - y + 1);
    }
  }

  function posicao(e) {
    const canvas = visivel.current;
    const caixa = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - caixa.left) / caixa.width) * canvas.width,
      y: ((e.clientY - caixa.top) / caixa.height) * canvas.height,
    };
  }

  function tracar(de, para) {
    const passo = Math.max(1, Number(tamanho) / 5);
    const dx = para.x - de.x;
    const dy = para.y - de.y;
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / passo));
    for (let k = 1; k <= n; k++) carimbarComSimetria(de.x + (dx * k) / n, de.y + (dy * k) / n);
  }

  function aoPressionar(e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    desenhando.current = true;
    const p = posicao(e);
    ultimoPonto.current = p;
    carimbarComSimetria(p.x, p.y);
    agendarRedesenho();
  }

  function aoMover(e) {
    if (!desenhando.current) return;
    const p = posicao(e);
    tracar(ultimoPonto.current, p);
    ultimoPonto.current = p;
    agendarRedesenho();
  }

  function aoSoltar() {
    desenhando.current = false;
    ultimoPonto.current = null;
  }

  useImperativeHandle(ref, () => ({
    obterMascaraBase64() {
      return mascara.current.toDataURL("image/png").split(",")[1];
    },

    limpar() {
      const ctx = mascara.current.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, largura, altura);
      redesenhar();
    },

    /**
     * Preenche a máscara com um filtro circular centrado na frequência zero:
     *   "passa-baixa": só o interior do círculo fica (branco), resto preto.
     *   "passa-alta" : o interior do círculo é removido (preto), resto fica.
     */
    preencherCirculo(raio, tipo) {
      const ctx = mascara.current.getContext("2d");
      const [fundo, circulo] = tipo === "passa-baixa" ? ["#000", "#fff"] : ["#fff", "#000"];
      ctx.fillStyle = fundo;
      ctx.fillRect(0, 0, largura, altura);
      ctx.fillStyle = circulo;
      ctx.beginPath();
      // a frequência zero está no pixel (largura/2, altura/2); centro = +0.5
      ctx.arc(largura / 2 + 0.5, altura / 2 + 0.5, raio, 0, Math.PI * 2);
      ctx.fill();
      redesenhar();
    },
  }));

  return (
    <canvas
      ref={visivel}
      width={largura}
      height={altura}
      onPointerDown={aoPressionar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={aoSoltar}
      aria-label="Espectro de Fourier editável. Arraste para pintar a máscara."
      style={{
        width: "100%",
        maxWidth: 560,
        aspectRatio: `${largura} / ${altura}`,
        background: "#000",
        border: "1px solid var(--border)",
        borderRadius: 4,
        cursor: "crosshair",
        touchAction: "none",
        imageRendering: "pixelated",
        display: "block",
      }}
    />
  );
});

export default SpectrumEditor;
