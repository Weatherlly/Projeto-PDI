"""
edges.py
--------
Detecção de bordas: filtros de Sobel (x e y separados) e magnitude do
gradiente (Cap. 3, Seção 3.6.3 e 3.6.4).

Usa o motor genérico de convolution.py: aqui só ficam os kernels e a
combinação das respostas. O Sobel é um filtro LINEAR (convolução); a
magnitude do gradiente, sqrt(gx² + gy²), é a parte NÃO-LINEAR.

Como o resultado da convolução tem valores negativos e maiores que 255,
as saídas destinadas à EXIBIÇÃO são normalizadas (imagem acinzentada),
conforme o enunciado. Os valores brutos (float) continuam disponíveis
em `sobel_bruto`, para qualquer cálculo posterior.
"""

import numpy as np

import convolution
import utils

# Gx responde a variações horizontais (detecta bordas VERTICAIS)
KERNEL_SOBEL_X = np.array([
    [-1, 0, 1],
    [-2, 0, 2],
    [-1, 0, 1],
], dtype=np.float64)

# Gy responde a variações verticais (detecta bordas HORIZONTAIS)
KERNEL_SOBEL_Y = np.array([
    [-1, -2, -1],
    [ 0,  0,  0],
    [ 1,  2,  1],
], dtype=np.float64)


def sobel_bruto(img: np.ndarray):
    """Devolve (gx, gy) em float64, sem normalizar (podem ser negativos)."""
    gx = convolution.convoluir_vetorizado(img, KERNEL_SOBEL_X)
    gy = convolution.convoluir_vetorizado(img, KERNEL_SOBEL_Y)
    return gx, gy


def sobel_x(img: np.ndarray) -> np.ndarray:
    """
    Sobel horizontal (Gx), NORMALIZADO para exibição: o valor 0 (sem
    variação) vira cinza médio; bordas claro->escuro e escuro->claro
    ficam em lados opostos desse cinza.
    """
    gx, _ = sobel_bruto(img)
    return utils.normalize_to_uint8(gx)


def sobel_y(img: np.ndarray) -> np.ndarray:
    """Sobel vertical (Gy), normalizado para exibição."""
    _, gy = sobel_bruto(img)
    return utils.normalize_to_uint8(gy)


def magnitude_gradiente(img: np.ndarray) -> np.ndarray:
    """
    Magnitude do gradiente:  |∇f| = sqrt(gx² + gy²).

    É sempre >= 0 e independe da direção da borda (detecção não linear).
    Normalizada para [0, 255] apenas para exibição. Em imagens coloridas
    o gradiente é calculado por canal, com normalização conjunta (um
    único máximo para os 3 canais), preservando as proporções de cor.
    """
    gx, gy = sobel_bruto(img)
    magnitude = np.sqrt(gx ** 2 + gy ** 2)
    return utils.normalize_to_uint8(magnitude)
