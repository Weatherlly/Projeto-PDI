"""
intensity.py
------------
Transformações de intensidade ponto-a-ponto (Cap. 3, Seções 3.1 e 3.2).

Todas as funções recebem e devolvem um array NumPy 2D em escala de
cinza (dtype uint8 na entrada), e implementam a transformação
"na mão" — sem usar funções prontas de PDI de alto nível.

Cada função é independente e mapeia s = T(r) para cada pixel r da
imagem de entrada, gerando a imagem de saída s.
"""

import numpy as np


def negativo(img: np.ndarray) -> np.ndarray:
    """
    Negativo da imagem: s = (L - 1) - r, com L = 256 níveis.

    Inverte o brilho: pixels claros viram escuros e vice-versa.
    """
    L = 256
    return (L - 1) - img.astype(np.int16)


def limiarizacao(img: np.ndarray, limiar: int) -> np.ndarray:
    """
    Limiarização (thresholding) binária:
        s = 255  se r >= limiar
        s = 0    caso contrário

    Parâmetros
    ----------
    limiar : int
        Valor de corte em [0, 255].
    """
    saida = np.where(img >= limiar, 255, 0)
    return saida.astype(np.uint8)


def ajuste_brilho(img: np.ndarray, delta: int) -> np.ndarray:
    """
    Ajuste de brilho por soma/subtração de uma constante:
        s = r + delta

    O resultado é saturado em [0, 255] (clip), pois brilho é uma
    operação de deslocamento simples, não de reescala de contraste.

    Parâmetros
    ----------
    delta : int
        Pode ser positivo (clareia) ou negativo (escurece).
    """
    resultado = img.astype(np.int16) + delta
    return np.clip(resultado, 0, 255).astype(np.uint8)


def correcao_gama(img: np.ndarray, gama: float, c: float = 1.0) -> np.ndarray:
    """
    Correção de gama (transformação de potência):
        s = c * r_norm^gama * 255

    onde r_norm = r / 255 é a intensidade normalizada em [0, 1].

    Parâmetros
    ----------
    gama : float
        gama < 1 clareia a imagem (expande sombras);
        gama > 1 escurece a imagem (expande realces).
    c : float
        Constante de escala, normalmente 1.0.
    """
    r_norm = img.astype(np.float64) / 255.0
    s = c * np.power(r_norm, gama) * 255.0
    return np.clip(s, 0, 255).astype(np.uint8)


def transformacao_linear_por_partes(img: np.ndarray, pontos: list) -> np.ndarray:
    """
    Transformação linear definida por partes (piecewise-linear), também
    conhecida como "contrast stretching" generalizado.

    Parâmetros
    ----------
    pontos : list[tuple[int, int]]
        Lista de pontos de controle (r, s) ordenados por r crescente,
        incluindo obrigatoriamente (0, s0) e (255, s255) como extremos.
        Exemplo clássico de alongamento de contraste:
            [(0, 0), (r1, s1), (r2, s2), (255, 255)]

    A função interpola linearmente entre cada par de pontos consecutivos,
    construindo uma Look-Up Table (LUT) de 256 posições e aplicando-a
    pixel a pixel (equivalente a uma busca em tabela, muito mais
    eficiente do que reavaliar a fórmula para cada pixel individualmente).
    """
    pontos_ordenados = sorted(pontos, key=lambda p: p[0])

    if pontos_ordenados[0][0] != 0:
        pontos_ordenados.insert(0, (0, pontos_ordenados[0][1]))
    if pontos_ordenados[-1][0] != 255:
        pontos_ordenados.append((255, pontos_ordenados[-1][1]))

    lut = np.zeros(256, dtype=np.float64)

    for i in range(len(pontos_ordenados) - 1):
        r1, s1 = pontos_ordenados[i]
        r2, s2 = pontos_ordenados[i + 1]

        if r2 == r1:
            # segmento vertical degenerado: evita divisão por zero
            lut[r1] = s2
            continue

        for r in range(r1, r2 + 1):
            # interpolação linear: s = s1 + (s2 - s1) * (r - r1) / (r2 - r1)
            lut[r] = s1 + (s2 - s1) * (r - r1) / (r2 - r1)

    lut = np.clip(lut, 0, 255).astype(np.uint8)
    return lut[img]
