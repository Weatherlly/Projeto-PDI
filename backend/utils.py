"""
utils.py
--------
Funções auxiliares de leitura, conversão de formatos (PIL <-> NumPy),
manipulação básica de matrizes e codificação de imagens para trafego via API.

Este módulo NÃO implementa nenhum algoritmo de PDI em si — apenas a
"cola" entre o mundo de arquivos/bytes (PIL, requisições HTTP) e o
mundo de matrizes (NumPy) onde os algoritmos das outras camadas atuam.
Mantê-lo separado facilita explicar, na apresentação, que a lógica de
PDI é 100% implementada à mão sobre arrays NumPy.
"""

import base64
import io

import numpy as np
from PIL import Image


# ---------------------------------------------------------------------------
# Conversão PIL <-> NumPy
# ---------------------------------------------------------------------------

def pil_to_gray_array(image: Image.Image) -> np.ndarray:
    """
    Converte uma imagem PIL (qualquer modo: L, RGB, RGBA, P, etc.) para
    um array NumPy 2D em escala de cinza, dtype uint8.

    Se a imagem já é single-channel (modo 'L'), os valores são lidos
    diretamente — SEM passar por conversão para RGB e de volta, pois
    isso introduziria erro de arredondamento de ponto flutuante
    (ex.: um pixel gravado como 91 poderia voltar como 90 ou 92 ao
    fazer L -> RGB -> luminância -> uint8). Esse erro de ±1 é
    irrelevante para a maioria dos filtros, mas é FATAL para a
    esteganografia, que depende do bit exato de cada pixel.

    Para imagens realmente coloridas, aplicamos a fórmula de
    luminância padrão (BT.601), calculada manualmente:
        Y = 0.299*R + 0.587*G + 0.114*B
    """
    if image.mode == "L":
        return np.asarray(image, dtype=np.uint8)

    rgb = image.convert("RGB")
    arr = np.asarray(rgb, dtype=np.float64)  # shape (H, W, 3)

    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    gray = 0.299 * r + 0.587 * g + 0.114 * b

    gray = np.clip(gray, 0, 255).astype(np.uint8)
    return gray


def pil_to_array(image: Image.Image) -> np.ndarray:
    """
    Carrega uma imagem PRESERVANDO o número de canais:
      - imagem em tons de cinza  -> array 2D (H, W), uint8
      - qualquer imagem colorida -> array 3D (H, W, 3) RGB, uint8

    Imagens com transparência (RGBA/LA/paleta com alpha) são compostas
    sobre fundo branco, para que pixels transparentes não virem preto.
    É a função de entrada usada pela API: o restante do backend recebe
    um array 2D ou 3D e cada módulo decide como tratar os canais.
    """
    if image.mode == "L":
        return np.asarray(image, dtype=np.uint8)
    if image.mode == "1":
        return np.asarray(image.convert("L"), dtype=np.uint8)

    tem_alpha = image.mode in ("RGBA", "LA") or (
        image.mode == "P" and "transparency" in image.info
    )
    if tem_alpha:
        rgba = image.convert("RGBA")
        fundo = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
        image = Image.alpha_composite(fundo, rgba)

    return np.asarray(image.convert("RGB"), dtype=np.uint8)


def eh_colorida(arr: np.ndarray) -> bool:
    """True se o array é (H, W, 3); False se é 2D (tons de cinza)."""
    return arr.ndim == 3


def garantir_rgb(arr: np.ndarray) -> np.ndarray:
    """Se a imagem for 2D, replica o canal 3x para obter (H, W, 3)."""
    if arr.ndim == 3:
        return arr
    return np.stack([arr, arr, arr], axis=2)


def intensidade_media(arr: np.ndarray) -> np.ndarray:
    """
    Intensidade I = (R + G + B) / 3 de uma imagem colorida, em float64
    (mesma definição de intensidade.m e do modelo HSI). Para imagens 2D
    devolve a própria imagem convertida para float.
    """
    if arr.ndim == 2:
        return arr.astype(np.float64)
    return arr.astype(np.float64).mean(axis=2)


def pil_to_rgb_array(image: Image.Image) -> np.ndarray:
    """Converte uma imagem PIL para array NumPy RGB (H, W, 3), uint8."""
    return np.asarray(image.convert("RGB"), dtype=np.uint8)


def array_to_pil(arr: np.ndarray) -> Image.Image:
    """
    Converte um array NumPy (2D escala de cinza, ou 3D RGB) de volta
    para uma imagem PIL, pronta para ser exportada/enviada.
    """
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    if arr.ndim == 2:
        return Image.fromarray(arr, mode="L")
    if arr.ndim == 3 and arr.shape[2] == 3:
        return Image.fromarray(arr, mode="RGB")
    raise ValueError(f"Formato de array não suportado para conversão: {arr.shape}")


# ---------------------------------------------------------------------------
# Base64 <-> bytes (para trafegar imagens pela API JSON)
# ---------------------------------------------------------------------------

def base64_to_pil(b64_string: str) -> Image.Image:
    """
    Decodifica uma string base64 (com ou sem o prefixo
    'data:image/png;base64,') em uma imagem PIL.
    """
    if "," in b64_string and b64_string.strip().startswith("data:"):
        b64_string = b64_string.split(",", 1)[1]

    raw = base64.b64decode(b64_string)
    return Image.open(io.BytesIO(raw))


def pil_to_base64(image: Image.Image, fmt: str = "PNG") -> str:
    """
    Codifica uma imagem PIL em base64 (sem prefixo data:), no formato
    solicitado (PNG por padrão, pois é sem perdas — importante para
    não corromper a esteganografia nem os valores de pixel filtrados).
    """
    buffer = io.BytesIO()
    image.save(buffer, format=fmt)
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


# ---------------------------------------------------------------------------
# Normalização (uso geral: exibição de resultados de convolução, etc.)
# ---------------------------------------------------------------------------

def normalize_to_uint8(arr: np.ndarray) -> np.ndarray:
    """
    Normaliza um array de floats (que pode conter valores negativos ou
    maiores que 255, típico de resultados de convolução) para a faixa
    [0, 255], preservando a forma da distribuição.

    Fórmula: (valor - min) / (max - min) * 255

    Usado exclusivamente para EXIBIÇÃO do resultado de filtros — nunca
    para os cálculos intermediários, que devem manter a precisão original
    (float) até o momento de gerar a imagem final.
    """
    arr = arr.astype(np.float64)
    minimo = arr.min()
    maximo = arr.max()

    if maximo - minimo < 1e-9:
        # Imagem constante: evita divisão por zero, devolve cinza médio
        return np.full_like(arr, 128, dtype=np.uint8)

    normalizado = (arr - minimo) / (maximo - minimo) * 255.0
    return normalizado.astype(np.uint8)


def clip_to_uint8(arr: np.ndarray) -> np.ndarray:
    """
    Alternativa à normalização: apenas satura (clipa) os valores fora
    de [0, 255], sem reescalar a distribuição. Útil quando queremos
    preservar a escala real de brilho (ex.: operações de brilho/soma)
    em vez de esticar o contraste.
    """
    return np.clip(arr, 0, 255).astype(np.uint8)
