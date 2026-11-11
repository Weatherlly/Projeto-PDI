import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../src/App.jsx";

let contador;
let chamadas;

beforeEach(() => {
  contador = 0;
  chamadas = [];
  localStorage.clear();
  localStorage.setItem("mini-gimp-pdi:backend-url", "http://backend.teste");
  // API simulada: cada chamada devolve uma imagem nova e identificável (R1, R2, ...)
  globalThis.fetch = vi.fn(async (url, opts) => {
    const corpo = JSON.parse(opts.body);
    chamadas.push({ url, corpo });
    contador += 1;
    return { ok: true, json: async () => ({ imagem_base64: `R${contador}` }) };
  });
});
afterEach(() => cleanup());

async function carregarImagem() {
  const arquivo = new File(["abc"], "foto.png", { type: "image/png" });
  const entrada = document.querySelector('input[type="file"]');
  fireEvent.change(entrada, { target: { files: [arquivo] } });
  await screen.findByText(/passo 0 de 0/);
}

const passo = () => screen.getByText(/passo \d+ de \d+/).textContent.replace(/\s+/g, " ");
async function previsualizar() {
  fireEvent.click(screen.getByText("Pré-visualizar"));
  await screen.findByText("Aplicar na imagem");
}
async function aplicarNaImagem() {
  fireEvent.click(screen.getByText("Aplicar na imagem"));
  await waitFor(() => expect(screen.queryByText("Aplicar na imagem")).toBeNull());
}

test("sem imagem não há barra de histórico", () => {
  render(<App />);
  expect(screen.queryByText(/passo \d+ de/)).toBeNull();
});

test("pré-visualizar NÃO altera a imagem; aplicar grava no histórico", async () => {
  render(<App />);
  await carregarImagem();
  await previsualizar();
  expect(passo()).toBe("passo 0 de 0");            // só prévia
  expect(screen.getByText(/ainda não alterou/)).toBeTruthy();
  await aplicarNaImagem();
  expect(passo()).toBe("passo 1 de 1");
});

test("descartar prévia mantém a imagem e o histórico intactos", async () => {
  render(<App />);
  await carregarImagem();
  await previsualizar();
  fireEvent.click(screen.getByText("Descartar prévia"));
  expect(screen.queryByText("Aplicar na imagem")).toBeNull();
  expect(passo()).toBe("passo 0 de 0");
});

test("as edições ACUMULAM: a 2ª edição parte do resultado da 1ª", async () => {
  render(<App />);
  await carregarImagem();
  await previsualizar();
  await aplicarNaImagem();                          // imagem atual passa a ser R1
  await previsualizar();                            // 2ª edição
  expect(chamadas[0].corpo.imagem_base64).toBe("YWJj");   // 1ª usou a original ("abc")
  expect(chamadas[1].corpo.imagem_base64).toBe("R1");     // 2ª usou o resultado da 1ª
  await aplicarNaImagem();
  await previsualizar();
  expect(chamadas[2].corpo.imagem_base64).toBe("R2");
});

test("Ctrl+Z desfaz e Ctrl+Y refaz; a edição seguinte usa a imagem restaurada", async () => {
  render(<App />);
  await carregarImagem();
  for (let i = 0; i < 2; i++) { await previsualizar(); await aplicarNaImagem(); }
  expect(passo()).toBe("passo 2 de 2");

  fireEvent.keyDown(window, { key: "z", ctrlKey: true });
  await waitFor(() => expect(passo()).toBe("passo 1 de 2"));
  fireEvent.keyDown(window, { key: "z", ctrlKey: true });
  await waitFor(() => expect(passo()).toBe("passo 0 de 2"));
  fireEvent.keyDown(window, { key: "z", ctrlKey: true });          // já no início: nada acontece
  expect(passo()).toBe("passo 0 de 2");

  fireEvent.keyDown(window, { key: "y", ctrlKey: true });
  await waitFor(() => expect(passo()).toBe("passo 1 de 2"));
  fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });  // Ctrl+Shift+Z desfaz o desfazer? não: refaz
  await waitFor(() => expect(passo()).toBe("passo 2 de 2"));

  // volta ao passo 1 (imagem R1) e edita: deve partir de R1, e o "refazer" some
  fireEvent.keyDown(window, { key: "z", ctrlKey: true });
  await waitFor(() => expect(passo()).toBe("passo 1 de 2"));
  await previsualizar();
  expect(chamadas.at(-1).corpo.imagem_base64).toBe("R1");
  await aplicarNaImagem();
  expect(passo()).toBe("passo 2 de 2");
  expect(screen.getByText(/Refazer/).closest("button").disabled).toBe(true);
});

test("botões Desfazer/Refazer refletem o estado (desabilitados nos extremos)", async () => {
  render(<App />);
  await carregarImagem();
  const desfazer = () => screen.getByText(/Desfazer/).closest("button");
  const refazer = () => screen.getByText(/Refazer/).closest("button");
  expect(desfazer().disabled).toBe(true);
  expect(refazer().disabled).toBe(true);
  await previsualizar(); await aplicarNaImagem();
  expect(desfazer().disabled).toBe(false);
  fireEvent.click(desfazer());
  await waitFor(() => expect(refazer().disabled).toBe(false));
  fireEvent.click(refazer());
  await waitFor(() => expect(passo()).toBe("passo 1 de 1"));
});

test("Ctrl+Z dentro de um campo de texto não desfaz a imagem", async () => {
  render(<App />);
  await carregarImagem();
  await previsualizar(); await aplicarNaImagem();
  const campoTexto = screen.getByLabelText("Passos guardados (limite) (valor)");
  campoTexto.focus();
  fireEvent.keyDown(campoTexto, { key: "z", ctrlKey: true });
  expect(passo()).toBe("passo 1 de 1");
});

test("limite configurável: guarda só as últimas N mudanças", async () => {
  render(<App />);
  await carregarImagem();
  const campoLimite = screen.getByLabelText("Passos guardados (limite) (valor)");
  fireEvent.focus(campoLimite);
  fireEvent.change(campoLimite, { target: { value: "2" } });
  fireEvent.blur(campoLimite);
  expect(localStorage.getItem("mini-gimp-pdi:limite-historico")).toBe("2");

  for (let i = 0; i < 5; i++) { await previsualizar(); await aplicarNaImagem(); }
  expect(passo()).toBe("passo 2 de 2");            // só 2 passos de desfazer
  fireEvent.keyDown(window, { key: "z", ctrlKey: true });
  fireEvent.keyDown(window, { key: "z", ctrlKey: true });
  fireEvent.keyDown(window, { key: "z", ctrlKey: true });
  await waitFor(() => expect(passo()).toBe("passo 0 de 2"));
});

test("reverter ao original é uma edição que também pode ser desfeita", async () => {
  render(<App />);
  await carregarImagem();
  await previsualizar(); await aplicarNaImagem();
  fireEvent.click(screen.getByText("Reverter ao original"));
  await waitFor(() => expect(passo()).toBe("passo 2 de 2"));
  await previsualizar();
  expect(chamadas.at(-1).corpo.imagem_base64).toBe("YWJj");   // voltou à original
  fireEvent.click(screen.getByText("Descartar prévia"));
  fireEvent.keyDown(window, { key: "z", ctrlKey: true });
  await waitFor(() => expect(passo()).toBe("passo 1 de 2"));
});

test("lista de histórico permite saltar para um passo", async () => {
  render(<App />);
  await carregarImagem();
  for (let i = 0; i < 3; i++) { await previsualizar(); await aplicarNaImagem(); }
  fireEvent.click(screen.getByText(/^1\. /));
  await waitFor(() => expect(passo()).toBe("passo 1 de 3"));
  expect(screen.getByText(/^3\. .*\(desfeito\)/)).toBeTruthy();
});

test("mudar a imagem (desfazer) descarta uma prévia pendente", async () => {
  render(<App />);
  await carregarImagem();
  await previsualizar(); await aplicarNaImagem();
  await previsualizar();                             // prévia pendente
  fireEvent.keyDown(window, { key: "z", ctrlKey: true });
  await waitFor(() => expect(screen.queryByText("Aplicar na imagem")).toBeNull());
});

test("carregar outra imagem pede confirmação quando há edições", async () => {
  render(<App />);
  await carregarImagem();
  await previsualizar(); await aplicarNaImagem();
  const confirmar = vi.spyOn(window, "confirm").mockReturnValue(false);
  const arquivo = new File(["xyz"], "outra.png", { type: "image/png" });
  fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [arquivo] } });
  await waitFor(() => expect(confirmar).toHaveBeenCalled());
  expect(passo()).toBe("passo 1 de 1");              // recusou: histórico mantido
  confirmar.mockReturnValue(true);
  fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [arquivo] } });
  await waitFor(() => expect(passo()).toBe("passo 0 de 0"));
});

test("erro da API aparece e não altera o histórico", async () => {
  render(<App />);
  await carregarImagem();
  globalThis.fetch = vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ detail: "Kernel inválido" }) }));
  fireEvent.click(screen.getByText("Pré-visualizar"));
  await screen.findByText("Kernel inválido");
  expect(passo()).toBe("passo 0 de 0");
});
