/**
 * client.js
 * ---------
 * Cliente HTTP central para conversar com o backend (FastAPI no Colab,
 * exposto via Ngrok). A URL do backend NUNCA é hardcoded: ela é lida
 * do localStorage, onde é salva pela tela de Configuração de Conexão
 * (ver components/ConnectionSettings.jsx).
 *
 * Isso é necessário porque a URL do Ngrok muda a cada vez que a sessão
 * do Colab é reiniciada — o usuário simplesmente cola a nova URL na
 * interface, sem precisar recompilar/redeployar o front-end.
 */

const STORAGE_KEY = "mini-gimp-pdi:backend-url";

export function getBackendUrl() {
  return localStorage.getItem(STORAGE_KEY) || "";
}

export function setBackendUrl(url) {
  // remove barra final, se houver, para evitar URLs duplas tipo "//intensidade"
  const limpo = url.trim().replace(/\/+$/, "");
  localStorage.setItem(STORAGE_KEY, limpo);
}

/**
 * Faz um POST JSON para o backend, já incluindo o header que evita a
 * página de aviso do Ngrok free tier interceptar a resposta.
 */
async function post(path, body) {
  const baseUrl = getBackendUrl();

  if (!baseUrl) {
    throw new Error(
      "Nenhuma URL de backend configurada. Cole a URL do Ngrok na tela de Conexão."
    );
  }

  let resposta;
  try {
    resposta = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify(body),
    });
  } catch (erroDeRede) {
    throw new Error(
      "Não foi possível conectar ao backend. Verifique se o Colab/Ngrok está rodando e se a URL está correta."
    );
  }

  if (!resposta.ok) {
    const detalhe = await resposta.json().catch(() => ({}));
    throw new Error(detalhe.detail || `Erro do backend (HTTP ${resposta.status})`);
  }

  return resposta.json();
}

/**
 * Testa a conexão com o backend chamando a rota raiz ("/").
 * Usado pela tela de Configuração de Conexão para dar feedback imediato.
 */
export async function testarConexao() {
  const baseUrl = getBackendUrl();
  if (!baseUrl) return { ok: false, mensagem: "Nenhuma URL configurada." };

  try {
    const resposta = await fetch(`${baseUrl}/`, {
      headers: { "ngrok-skip-browser-warning": "true" },
    });
    if (!resposta.ok) return { ok: false, mensagem: `Backend respondeu com erro (HTTP ${resposta.status}).` };
    const dados = await resposta.json();
    return { ok: true, mensagem: dados.mensagem || "Conectado." };
  } catch {
    return { ok: false, mensagem: "Não foi possível alcançar essa URL." };
  }
}

/**
 * Converte um arquivo de imagem (File, do <input type="file">) para
 * uma string base64 pura (sem o prefixo "data:image/...;base64,").
 */
export function arquivoParaBase64(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result.split(",")[1]);
    leitor.onerror = () => reject(new Error("Falha ao ler o arquivo de imagem."));
    leitor.readAsDataURL(arquivo);
  });
}

// ---------------------------------------------------------------------------
// Endpoints agrupados por módulo do backend (espelha a estrutura de arquivos
// do backend: intensity.py, steganography.py, histogram.py, filters.py)
// ---------------------------------------------------------------------------

export const intensidadeApi = {
  negativo: (imagem_base64) => post("/intensidade/negativo", { imagem_base64 }),
  limiarizacao: (imagem_base64, limiar) => post("/intensidade/limiarizacao", { imagem_base64, limiar }),
  brilho: (imagem_base64, delta) => post("/intensidade/brilho", { imagem_base64, delta }),
  gama: (imagem_base64, gama, c = 1.0) => post("/intensidade/gama", { imagem_base64, gama, c }),
  linearPorPartes: (imagem_base64, pontos) =>
    post("/intensidade/linear-por-partes", { imagem_base64, pontos }),
};

export const esteganografiaApi = {
  esconder: (imagem_base64, mensagem) => post("/esteganografia/esconder", { imagem_base64, mensagem }),
  revelar: (imagem_base64) => post("/esteganografia/revelar", { imagem_base64 }),
};

export const histogramaApi = {
  // devolve { canais: { cinza: [...] } } ou { canais: { r, g, b, i } }
  calcular: (imagem_base64) => post("/histograma/calcular", { imagem_base64 }),
  equalizar: (imagem_base64) => post("/histograma/equalizar", { imagem_base64 }),
};

export const filtrosApi = {
  media: (imagem_base64, tamanho) => post("/filtros/media", { imagem_base64, tamanho }),
  gaussiano: (imagem_base64, tamanho, sigma) => post("/filtros/gaussiano", { imagem_base64, tamanho, sigma }),
  mediana: (imagem_base64, tamanho) => post("/filtros/mediana", { imagem_base64, tamanho }),
  laplaciano: (imagem_base64, variante) => post("/filtros/laplaciano", { imagem_base64, variante }),
  highBoost: (imagem_base64, tamanho_blur, k) =>
    post("/filtros/high-boost", { imagem_base64, tamanho_blur, k }),
  generico: (imagem_base64, kernel, normalizar = true) =>
    post("/filtros/generico", { imagem_base64, kernel, normalizar }),
};

// --- bordas (edges.py) ---
export const bordasApi = {
  sobelX: (imagem_base64) => post("/bordas/sobel-x", { imagem_base64 }),
  sobelY: (imagem_base64) => post("/bordas/sobel-y", { imagem_base64 }),
  gradiente: (imagem_base64) => post("/bordas/gradiente", { imagem_base64 }),
};

// --- operações espaciais (geometry.py) ---
export const geometriaApi = {
  escala: (imagem_base64, sx, sy, interpolacao) =>
    post("/geometria/escala", { imagem_base64, sx, sy, interpolacao }),
  rotacao: (imagem_base64, angulo, pivo, interpolacao, canvas) =>
    post("/geometria/rotacao", {
      imagem_base64,
      angulo,
      pivo_x: pivo ? pivo.x : null,
      pivo_y: pivo ? pivo.y : null,
      interpolacao,
      canvas,
    }),
};

// --- domínio da frequência (fourier.py) ---
export const frequenciaApi = {
  // devolve { espectro_base64, largura, altura, tempo_ms }
  espectro: (imagem_base64, metodo) => post("/frequencia/espectro", { imagem_base64, metodo }),
  // devolve { imagem_base64, tempo_ms }
  filtrar: (imagem_base64, mascara_base64, metodo) =>
    post("/frequencia/filtrar", { imagem_base64, mascara_base64, metodo }),
};

// --- sistemas de cores (color.py) ---
export const coresApi = {
  rgbParaHsi: (imagem_base64) => post("/cores/rgb-para-hsi", { imagem_base64 }),
  hsiParaRgb: (h_base64, s_base64, i_base64) =>
    post("/cores/hsi-para-rgb", { h_base64, s_base64, i_base64 }),
  cinza: (imagem_base64, metodo) => post("/cores/cinza", { imagem_base64, metodo }),
  chromaKey: (imagem_base64, fundo_base64, cor_chave, distancia) =>
    post("/cores/chroma-key", { imagem_base64, fundo_base64, cor_chave, distancia }),
  ajusteHsi: (imagem_base64, delta_matiz, fator_saturacao, delta_brilho) =>
    post("/cores/ajuste-hsi", { imagem_base64, delta_matiz, fator_saturacao, delta_brilho }),
  ajusteCanal: (imagem_base64, deltas, modelo) =>
    post("/cores/ajuste-canal", { imagem_base64, deltas, modelo }),
  sepia: (imagem_base64) => post("/cores/sepia", { imagem_base64 }),
};

/**
 * Lê um arquivo de imagem e devolve { base64, mime } — o formato com que o
 * histórico guarda cada estado da imagem.
 */
export async function lerImagem(arquivo) {
  return { base64: await arquivoParaBase64(arquivo), mime: arquivo.type || "image/png" };
}
