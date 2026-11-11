import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "../src/App.jsx";

let chamadas;

// Canvas falso: o jsdom não implementa getContext; aceitamos qualquer chamada.
function instalarCanvasFalso() {
  const ctx = new Proxy({}, {
    get: (_, nome) => (nome === "createRadialGradient" ? () => ({ addColorStop() {} }) : () => {}),
    set: () => true,
  });
  HTMLCanvasElement.prototype.getContext = () => ctx;
  HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,MASCARA";
  globalThis.Image = class { set src(_) { setTimeout(() => this.onload?.(), 0); } };
}

beforeEach(() => {
  chamadas = [];
  localStorage.clear();
  localStorage.setItem("mini-gimp-pdi:backend-url", "http://backend.teste");
  globalThis.fetch = vi.fn(async (url, opts) => {
    const corpo = JSON.parse(opts.body);
    chamadas.push({ url, corpo });
    let resposta = { imagem_base64: "RES" };
    if (url.includes("/frequencia/espectro")) resposta = { espectro_base64: "ESP", largura: 64, altura: 64, tempo_ms: 1.5 };
    if (url.includes("/frequencia/filtrar")) resposta = { imagem_base64: "FILTRADA", tempo_ms: 2.5 };
    if (url.includes("/histograma/calcular")) resposta = { canais: { r: Array(256).fill(1), g: Array(256).fill(2), b: Array(256).fill(3), i: Array(256).fill(4) } };
    if (url.includes("/cores/rgb-para-hsi")) resposta = { h_base64: "H", s_base64: "S", i_base64: "I" };
    return { ok: true, json: async () => resposta };
  });
});
afterEach(() => cleanup());

async function iniciar() {
  render(<App />);
  const arquivo = new File(["abc"], "foto.png", { type: "image/png" });
  fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [arquivo] } });
  await screen.findByText(/passo 0 de 0/);
}
const aba = (nome) => fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${nome}`) }));
const ultima = () => chamadas.at(-1);

test("todas as abas abrem sem erro e mostram seu botão principal", async () => {
  await iniciar();
  const esperado = [
    ["Intensidade", "Pré-visualizar"], ["Esteganografia", "Revelar mensagem"],
    ["Histograma", "Pré-visualizar equalização"], ["Filtros espaciais", "Pré-visualizar"],
    ["Bordas", "Pré-visualizar"], ["Escala e rotação", "Pré-visualizar"],
    ["Frequência", "Calcular espectro"], ["Cores", "Converter para HSI"],
  ];
  for (const [nomeAba, botao] of esperado) {
    aba(nomeAba);
    expect(await screen.findByText(botao)).toBeTruthy();
  }
});

test("intensidade: slider+campo alimentam a requisição com o valor digitado", async () => {
  await iniciar();
  fireEvent.click(screen.getByText("Limiarização"));
  const campo = screen.getByLabelText("Limiar (valor)");
  fireEvent.focus(campo);
  fireEvent.change(campo, { target: { value: "173" } });
  fireEvent.click(screen.getByText("Pré-visualizar"));
  await screen.findByText("Aplicar na imagem");
  expect(ultima().url).toContain("/intensidade/limiarizacao");
  expect(ultima().corpo.limiar).toBe(173);
});

test("filtro livre: envia o kernel; mudar o tamanho preserva os pesos no centro", async () => {
  await iniciar();
  aba("Filtros espaciais");
  fireEvent.click(screen.getByText("Pré-visualizar"));
  await screen.findByText("Aplicar na imagem");
  expect(ultima().url).toContain("/filtros/generico");
  expect(ultima().corpo.kernel).toHaveLength(3);
  expect(ultima().corpo.kernel[1][1]).toBeCloseTo(0.1111, 3);
  expect(ultima().corpo.normalizar).toBe(true);

  fireEvent.click(screen.getByText("Descartar prévia"));
  fireEvent.change(screen.getByDisplayValue("3 x 3"), { target: { value: "9" } });
  expect(screen.getByRole("group", { name: "Pesos do kernel" }).querySelectorAll("input")).toHaveLength(81);
  fireEvent.click(screen.getByText("Pré-visualizar"));
  await screen.findByText("Aplicar na imagem");
  const k = ultima().corpo.kernel;
  expect(k).toHaveLength(9);
  expect(k[4][4]).toBeCloseTo(0.1111, 3);   // o 3x3 antigo ficou no centro
  expect(k[3][3]).toBeCloseTo(0.1111, 3);
  expect(k[0][0]).toBe(0);                   // células novas começam em 0
});

test("filtro livre: edição manual de uma célula e preset", async () => {
  await iniciar();
  aba("Filtros espaciais");
  const celula = screen.getByLabelText("peso linha 2 coluna 2");
  fireEvent.change(celula, { target: { value: "5" } });
  fireEvent.click(screen.getByText("Pré-visualizar"));
  await screen.findByText("Aplicar na imagem");
  expect(ultima().corpo.kernel[1][1]).toBe(5);
  fireEvent.click(screen.getByText("Descartar prévia"));

  // preset "Laplaciano" (o 2º botão com esse nome; o 1º é a operação)
  fireEvent.click(screen.getAllByText("Laplaciano")[1]);
  fireEvent.click(screen.getByText("Pré-visualizar"));
  await screen.findByText("Aplicar na imagem");
  expect(ultima().corpo.kernel).toEqual([[1, 1, 1], [1, -8, 1], [1, 1, 1]]);
});

test("filtro livre: célula inválida mostra erro e não chama a API", async () => {
  await iniciar();
  aba("Filtros espaciais");
  fireEvent.change(screen.getByLabelText("peso linha 1 coluna 1"), { target: { value: "abc" } });
  const antes = chamadas.length;
  fireEvent.click(screen.getByText("Pré-visualizar"));
  expect(await screen.findByText(/células vazias ou inválidas/)).toBeTruthy();
  expect(chamadas.length).toBe(antes);
});

test("filtro aplicado acumula: média 9x9 depois mediana usa o resultado anterior", async () => {
  await iniciar();
  aba("Filtros espaciais");
  fireEvent.click(screen.getAllByText("Média")[0]);   // operação (o 2º é o modelo de kernel)
  fireEvent.change(screen.getByDisplayValue("3 x 3"), { target: { value: "9" } });
  fireEvent.click(screen.getByText("Pré-visualizar"));
  await screen.findByText("Aplicar na imagem");
  expect(ultima().corpo).toMatchObject({ tamanho: 9, imagem_base64: "YWJj" });
  fireEvent.click(screen.getByText("Aplicar na imagem"));
  await waitFor(() => expect(screen.getByText(/passo 1 de 1/)).toBeTruthy());
  fireEvent.click(screen.getByText("Mediana"));
  fireEvent.click(screen.getByText("Pré-visualizar"));
  await waitFor(() => expect(ultima().url).toContain("/filtros/mediana"));
  expect(ultima().corpo.imagem_base64).toBe("RES");
});

test("geometria: escala e rotação enviam os parâmetros escolhidos", async () => {
  await iniciar();
  aba("Escala e rotação");
  fireEvent.change(screen.getAllByDisplayValue("2")[0], { target: { value: "1.5" } });   // escala x (proporcional → y)
  fireEvent.change(screen.getByDisplayValue("Bilinear"), { target: { value: "vizinho" } });
  fireEvent.click(screen.getByText("Pré-visualizar"));
  await screen.findByText("Aplicar na imagem");
  expect(ultima().corpo).toMatchObject({ sx: 1.5, sy: 1.5, interpolacao: "vizinho" });
  fireEvent.click(screen.getByText("Descartar prévia"));

  fireEvent.click(screen.getByRole("button", { name: "Rotação" }));
  const angulo = screen.getByLabelText("Ângulo (anti-horário) (valor)");
  fireEvent.focus(angulo);
  fireEvent.change(angulo, { target: { value: "47.5" } });
  fireEvent.click(screen.getByText("Pré-visualizar"));
  await screen.findByText("Aplicar na imagem");
  expect(ultima().url).toContain("/geometria/rotacao");
  expect(ultima().corpo).toMatchObject({ angulo: 47.5, pivo_x: null, pivo_y: null, canvas: "ajustar" });
});

test("bordas: Sobel Y e gradiente chamam os endpoints certos", async () => {
  await iniciar();
  aba("Bordas");
  fireEvent.click(screen.getByText("Sobel Y"));
  fireEvent.click(screen.getByText("Pré-visualizar"));
  await screen.findByText("Aplicar na imagem");
  expect(ultima().url).toContain("/bordas/sobel-y");
  fireEvent.click(screen.getByText("Gradiente (magnitude)", { selector: "button" }));
  fireEvent.click(screen.getByText("Pré-visualizar"));
  await waitFor(() => expect(ultima().url).toContain("/bordas/gradiente"));
});

test("histograma: mostra R, G, B e I; equalização mostra antes e depois", async () => {
  await iniciar();
  aba("Histograma");
  fireEvent.click(screen.getByText("Calcular histograma"));
  await screen.findByText("R (vermelho)");
  expect(screen.getByText("I (intensidade)")).toBeTruthy();
  fireEvent.click(screen.getByText("Pré-visualizar equalização"));
  await screen.findByText("depois da equalização");
  expect(screen.getByText("antes da equalização")).toBeTruthy();
});

test("cores: HSI mostra os 3 canais e volta para RGB; ajustes enviam valores", async () => {
  await iniciar();
  aba("Cores");
  fireEvent.click(screen.getByText("Converter para HSI"));
  await screen.findByAltText("H — matiz");
  fireEvent.click(screen.getByText("Voltar para RGB"));
  await screen.findByText("Aplicar na imagem");
  expect(ultima().corpo).toMatchObject({ h_base64: "H", s_base64: "S", i_base64: "I" });
  fireEvent.click(screen.getByText("Descartar prévia"));

  fireEvent.click(screen.getByText("Matiz / Saturação / Brilho"));
  const matiz = screen.getByLabelText("Matiz (valor)");
  fireEvent.focus(matiz);
  fireEvent.change(matiz, { target: { value: "120" } });
  fireEvent.click(screen.getByText("Pré-visualizar"));
  await screen.findByText("Aplicar na imagem");
  expect(ultima().corpo).toMatchObject({ delta_matiz: 120, fator_saturacao: 1, delta_brilho: 0 });
});

test("cores: ajuste de canal CMY e chroma-key exigindo imagem de fundo", async () => {
  await iniciar();
  aba("Cores");
  fireEvent.click(screen.getByText("Ajuste de canal"));
  fireEvent.change(screen.getByDisplayValue("RGB (R, G, B)"), { target: { value: "cmy" } });
  const c = screen.getByLabelText("Canal C (valor)");
  fireEvent.focus(c);
  fireEvent.change(c, { target: { value: "40" } });
  fireEvent.click(screen.getByText("Pré-visualizar"));
  await screen.findByText("Aplicar na imagem");
  expect(ultima().corpo).toMatchObject({ deltas: [40, 0, 0], modelo: "cmy" });
  fireEvent.click(screen.getByText("Descartar prévia"));

  fireEvent.click(screen.getByText("Chroma-key"));
  fireEvent.click(screen.getByText("Pré-visualizar"));
  expect(await screen.findByText(/Escolha a imagem que vai substituir/)).toBeTruthy();
});

test("frequência: espectro, máscara enviada ao backend e prévia aplicável", async () => {
  instalarCanvasFalso();
  await iniciar();
  aba("Frequência");
  fireEvent.click(screen.getByText("Calcular espectro"));
  await screen.findByText(/espectro: 1.5 ms/);
  expect(ultima().corpo.metodo).toBe("fft");

  const raio = screen.getByLabelText("Filtro circular rápido: raio (valor)");
  fireEvent.focus(raio);
  fireEvent.change(raio, { target: { value: "12" } });
  fireEvent.click(screen.getByText("Passa-baixa"));
  fireEvent.change(screen.getByDisplayValue("FFT própria (radix-2)"), { target: { value: "numpy" } });

  fireEvent.click(screen.getByText("Pré-visualizar filtro"));
  await screen.findByText("Aplicar na imagem");
  expect(ultima().url).toContain("/frequencia/filtrar");
  expect(ultima().corpo).toMatchObject({ mascara_base64: "MASCARA", metodo: "numpy", imagem_base64: "YWJj" });
  expect(screen.getByText(/filtragem: 2.5 ms/)).toBeTruthy();

  // aplicar muda a imagem → o espectro antigo some (precisa recalcular)
  fireEvent.click(screen.getByText("Aplicar na imagem"));
  await waitFor(() => expect(screen.queryByText(/espectro deslocado/)).toBeNull());
  expect(screen.getByText(/passo 1 de 1/)).toBeTruthy();
});
