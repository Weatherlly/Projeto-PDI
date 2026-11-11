"""
color.py
--------
Processamento de imagens coloridas (Cap. 6).

  - Conversão RGB <-> HSI (ida e volta)
  - Escala de cinza: média simples e média ponderada
  - Chroma-key (distância da cor verde + imagem de fundo)
  - Equalização de histograma em imagens coloridas (via canal I do HSI)
  - Ajuste de matiz, saturação e brilho (no espaço HSI)
  - Ajuste de canal (R/G/B ou C/M/Y)
  - Sépia

Convenção interna do HSI (float64):
    H em graus [0, 360) ; S em [0, 1] ; I em [0, 1]

Fórmulas do HSI: as do livro-texto (Gonzalez & Woods, Seção 6.2), em
que a conversão tem inversa exata:
    I = (R+G+B)/3
    S = 1 - 3·min(R,G,B)/(R+G+B)
    H = θ            se B <= G,   H = 360° - θ  se B > G
    θ = arccos( ½[(R-G)+(R-B)] / sqrt((R-G)² + (R-B)(G-B)) )
Os modelos intensidade.m / matiz.m / saturacao.m calculam I e H de forma
equivalente a esta, mas S como (max-min)/max (fórmula do HSV); veja
docs/referencia_octave.md para a comparação e o motivo da escolha.
"""

import numpy as np

import geometry
import histogram
import utils

_EPS = 1e-12


# ---------------------------------------------------------------------------
# RGB <-> HSI
# ---------------------------------------------------------------------------

def rgb_para_hsi(img: np.ndarray) -> np.ndarray:
    """
    Converte uma imagem RGB uint8 (H, W, 3) para HSI float64 (H, W, 3),
    com H em graus [0, 360), S e I em [0, 1].
    Para pixels cinza (R=G=B) o matiz é indefinido: devolvemos H = 0, S = 0.
    """
    rgb = img.astype(np.float64) / 255.0
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]

    soma = r + g + b
    intensidade = soma / 3.0
    minimo = np.minimum(np.minimum(r, g), b)
    saturacao = np.where(soma > _EPS, 1.0 - 3.0 * minimo / np.where(soma > _EPS, soma, 1.0), 0.0)

    numerador = 0.5 * ((r - g) + (r - b))
    denominador = np.sqrt((r - g) ** 2 + (r - b) * (g - b))
    cromatico = denominador > _EPS
    cos_theta = np.where(cromatico, numerador / np.where(cromatico, denominador, 1.0), 1.0)
    theta = np.degrees(np.arccos(np.clip(cos_theta, -1.0, 1.0)))
    matiz = np.where(b <= g, theta, 360.0 - theta)
    matiz = np.where(cromatico, matiz, 0.0)

    return np.stack([matiz, saturacao, intensidade], axis=-1)


def hsi_para_rgb(hsi: np.ndarray) -> np.ndarray:
    """
    Converte HSI float64 (H em graus, S e I em [0,1]) para RGB uint8.
    O círculo de matiz é dividido em 3 setores de 120° (RG, GB, BR); em
    cada um uma componente vale I(1-S), outra I[1 + S·cosH/cos(60°-H)]
    e a terceira sai de R+G+B = 3I.
    """
    h = np.mod(hsi[..., 0], 360.0)
    s = np.clip(hsi[..., 1], 0.0, 1.0)
    i = np.clip(hsi[..., 2], 0.0, 1.0)

    h_setor = np.radians(np.mod(h, 120.0))
    fator = np.cos(h_setor) / np.cos(np.radians(60.0) - h_setor)

    x = i * (1.0 - s)
    y = i * (1.0 + s * fator)
    z = 3.0 * i - (x + y)

    setor1 = h < 120.0
    setor2 = (h >= 120.0) & (h < 240.0)

    r = np.where(setor1, y, np.where(setor2, x, z))
    g = np.where(setor1, z, np.where(setor2, y, x))
    b = np.where(setor1, x, np.where(setor2, z, y))

    rgb = np.stack([r, g, b], axis=-1)
    return np.clip(np.rint(rgb * 255.0), 0, 255).astype(np.uint8)


def hsi_para_canais_uint8(img: np.ndarray):
    """
    RGB -> (H, S, I) como três imagens em tons de cinza uint8, para
    EXIBIÇÃO: H é mapeado de [0,360) para [0,255]; S e I de [0,1] para
    [0,255]. (A quantização em 8 bits perde ~1,4° de precisão no matiz.)
    """
    hsi = rgb_para_hsi(utils.garantir_rgb(img))
    h8 = np.clip(np.rint(hsi[..., 0] / 360.0 * 255.0), 0, 255).astype(np.uint8)
    s8 = np.clip(np.rint(hsi[..., 1] * 255.0), 0, 255).astype(np.uint8)
    i8 = np.clip(np.rint(hsi[..., 2] * 255.0), 0, 255).astype(np.uint8)
    return h8, s8, i8


def canais_uint8_para_rgb(h8: np.ndarray, s8: np.ndarray, i8: np.ndarray) -> np.ndarray:
    """Operação inversa de `hsi_para_canais_uint8`."""
    hsi = np.stack([
        h8.astype(np.float64) / 255.0 * 360.0,
        s8.astype(np.float64) / 255.0,
        i8.astype(np.float64) / 255.0,
    ], axis=-1)
    return hsi_para_rgb(hsi)


# ---------------------------------------------------------------------------
# Escala de cinza
# ---------------------------------------------------------------------------

def escala_de_cinza(img: np.ndarray, metodo: str = "ponderada") -> np.ndarray:
    """
    Converte para tons de cinza (2D uint8).
      "media"     : (R + G + B) / 3                 — todos os canais pesam igual
      "ponderada" : 0,299 R + 0,587 G + 0,114 B     — pesos da sensibilidade do
                    olho humano (verde pesa mais, azul menos)
    """
    rgb = utils.garantir_rgb(img).astype(np.float64)
    if metodo == "media":
        cinza = rgb.mean(axis=2)
    elif metodo == "ponderada":
        cinza = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    else:
        raise ValueError("metodo deve ser 'media' ou 'ponderada'.")
    return np.clip(np.rint(cinza), 0, 255).astype(np.uint8)


# ---------------------------------------------------------------------------
# Chroma-key
# ---------------------------------------------------------------------------

def chroma_key(img: np.ndarray, fundo: np.ndarray, cor_chave=(0, 255, 0),
               distancia: float = 100.0) -> np.ndarray:
    """
    Substitui por `fundo` todos os pixels "parecidos" com a cor-chave.

    Um pixel é substituído se sua distância euclidiana (no espaço RGB, de
    0 a ~441) até `cor_chave` for <= `distancia`. Distância pequena =
    só o verde quase puro some; grande = tons mais distantes também.
    O fundo é redimensionado (bilinear) para o tamanho da imagem.
    """
    if distancia < 0:
        raise ValueError("A distância deve ser >= 0.")
    rgb = utils.garantir_rgb(img)
    fundo_rgb = utils.garantir_rgb(fundo)

    altura, largura = rgb.shape[:2]
    if fundo_rgb.shape[:2] != (altura, largura):
        fundo_rgb = geometry.redimensionar(fundo_rgb, altura, largura, "bilinear")

    chave = np.array(cor_chave, dtype=np.float64).reshape(1, 1, 3)
    dist = np.sqrt(np.sum((rgb.astype(np.float64) - chave) ** 2, axis=2))
    substituir = (dist <= distancia)[..., None]

    return np.where(substituir, fundo_rgb, rgb).astype(np.uint8)


# ---------------------------------------------------------------------------
# Ajustes no espaço HSI
# ---------------------------------------------------------------------------

def ajuste_hsi(img: np.ndarray, delta_matiz: float = 0.0,
               fator_saturacao: float = 1.0, delta_brilho: float = 0.0) -> np.ndarray:
    """
    Ajusta matiz, saturação e brilho no espaço HSI.

    delta_matiz     : graus somados ao matiz (rotaciona as cores; circular)
    fator_saturacao : multiplica S (0 = cinza, 1 = igual, >1 = mais vivo)
    delta_brilho    : somado a I, em níveis de 0 a 255 (pode ser negativo)
    """
    hsi = rgb_para_hsi(utils.garantir_rgb(img))
    hsi[..., 0] = np.mod(hsi[..., 0] + delta_matiz, 360.0)
    hsi[..., 1] = np.clip(hsi[..., 1] * fator_saturacao, 0.0, 1.0)
    hsi[..., 2] = np.clip(hsi[..., 2] + delta_brilho / 255.0, 0.0, 1.0)
    return hsi_para_rgb(hsi)


def equalizar_histograma_hsi(img: np.ndarray) -> np.ndarray:
    """
    Equalização de histograma em imagem colorida: equaliza SÓ o canal I
    do HSI e mantém H e S. Equalizar R, G e B separadamente mudaria a
    proporção entre eles e distorceria as cores; assim apenas o contraste
    (luminosidade) muda.
    """
    hsi = rgb_para_hsi(utils.garantir_rgb(img))
    i8 = np.clip(np.rint(hsi[..., 2] * 255.0), 0, 255).astype(np.uint8)
    i_equalizado = histogram.equalizar_histograma(i8)
    hsi[..., 2] = i_equalizado.astype(np.float64) / 255.0
    return hsi_para_rgb(hsi)


# ---------------------------------------------------------------------------
# Ajuste de canal e sépia
# ---------------------------------------------------------------------------

def ajuste_canais(img: np.ndarray, deltas, modelo: str = "rgb") -> np.ndarray:
    """
    Soma um valor a cada canal. `deltas` = (d1, d2, d3), cada um em
    [-255, 255], com saturação em [0, 255].

    modelo "rgb": (d1, d2, d3) = (R, G, B)  — positivo clareia o canal.
    modelo "cmy": (d1, d2, d3) = (C, M, Y)  — como C = 255 - R (e M, Y
        análogos), somar d a C equivale a SUBTRAIR d de R: positivo
        acrescenta ciano/magenta/amarelo (e portanto tira vermelho/
        verde/azul).
    """
    if len(deltas) != 3:
        raise ValueError("Informe 3 valores de ajuste (um por canal).")
    if modelo not in ("rgb", "cmy"):
        raise ValueError("modelo deve ser 'rgb' ou 'cmy'.")

    sinal = 1.0 if modelo == "rgb" else -1.0
    ajuste = sinal * np.array(deltas, dtype=np.float64).reshape(1, 1, 3)
    rgb = utils.garantir_rgb(img).astype(np.float64)
    return np.clip(rgb + ajuste, 0, 255).astype(np.uint8)


MATRIZ_SEPIA = np.array([
    [0.393, 0.769, 0.189],
    [0.349, 0.686, 0.168],
    [0.272, 0.534, 0.131],
], dtype=np.float64)


def sepia(img: np.ndarray) -> np.ndarray:
    """
    Sépia ("escala de cinza amarelada"): cada pixel novo é uma combinação
    linear fixa dos canais originais (matriz clássica de sépia), com
    saturação em 255:  [R' G' B']ᵀ = MATRIZ_SEPIA · [R G B]ᵀ
    """
    rgb = utils.garantir_rgb(img).astype(np.float64)
    resultado = rgb @ MATRIZ_SEPIA.T
    return np.clip(np.rint(resultado), 0, 255).astype(np.uint8)
