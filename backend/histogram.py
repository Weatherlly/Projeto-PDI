"""
histogram.py
------------
Cálculo de histograma em escala de cinza e equalização de histograma
baseada em Função de Distribuição Acumulada (CDF). (Cap. 3, Seções 3.2 e 3.3)
"""

import numpy as np


def calcular_histograma(img: np.ndarray) -> np.ndarray:
    """
    Calcula o histograma de uma imagem em escala de cinza: um array de
    256 posições, onde histograma[i] = número de pixels com intensidade i.

    Implementado por contagem manual (sem np.histogram), para deixar
    explícito o algoritmo: percorre a imagem e incrementa o "balde"
    correspondente a cada valor de pixel.
    """
    histograma = np.zeros(256, dtype=np.int64)
    valores, contagens = np.unique(img, return_counts=True)
    histograma[valores] = contagens
    return histograma


def calcular_cdf(histograma: np.ndarray) -> np.ndarray:
    """
    Calcula a Função de Distribuição Acumulada (CDF) normalizada a
    partir do histograma, ou seja, para cada nível de cinza i:

        cdf[i] = (soma de histograma[0..i]) / (total de pixels)

    Retorna um array de floats em [0, 1], monotonicamente crescente.
    """
    cdf = np.cumsum(histograma).astype(np.float64)
    total_pixels = cdf[-1]

    if total_pixels == 0:
        return cdf

    return cdf / total_pixels


def equalizar_histograma(img: np.ndarray) -> np.ndarray:
    """
    Equalização de histograma clássica:

    1. Calcula o histograma da imagem;
    2. Calcula a CDF normalizada;
    3. Constrói uma LUT mapeando cada nível de cinza r para
       s = round(255 * cdf[r]);
    4. Aplica a LUT pixel a pixel.

    O efeito é redistribuir as intensidades de forma mais uniforme,
    aumentando o contraste global da imagem.
    """
    histograma = calcular_histograma(img)
    cdf = calcular_cdf(histograma)

    lut = np.round(255 * cdf).astype(np.uint8)

    return lut[img]


# ---------------------------------------------------------------------------
# Imagens coloridas
# ---------------------------------------------------------------------------

def histogramas_cor(img: np.ndarray) -> dict:
    """
    Histogramas de uma imagem colorida: R, G, B e a intensidade I
    (I = (R+G+B)/3, arredondada para inteiro 0..255).

    Para imagens 2D (cinza) devolve um único histograma, "cinza".
    Cada histograma é um array de 256 contagens.
    """
    if img.ndim == 2:
        return {"cinza": calcular_histograma(img)}

    intensidade = np.round(img.astype(np.float64).mean(axis=2)).astype(np.uint8)
    return {
        "r": calcular_histograma(img[:, :, 0]),
        "g": calcular_histograma(img[:, :, 1]),
        "b": calcular_histograma(img[:, :, 2]),
        "i": calcular_histograma(intensidade),
    }
