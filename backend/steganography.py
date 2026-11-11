"""
steganography.py
-----------------
Esteganografia por bits menos significativos (LSB - Least Significant Bit).

Separado de intensity.py de propósito: embora esteja na mesma seção do
plano de ensino, é conceitualmente uma técnica de "canal escondido"
(manipulação de bits), não uma transformação de intensidade clássica —
isso fica mais claro tratando-a como seu próprio módulo na apresentação.

Estratégia
----------
Cada caractere da mensagem é convertido para 8 bits (ASCII). Cada bit é
escondido no bit menos significativo de um pixel da imagem (percorrida
em ordem linha a linha, coluna a coluna). Usamos um "marcador de fim de
mensagem" (delimitador) para saber onde parar ao revelar a mensagem,
em vez de exigir que o tamanho da mensagem seja conhecido a priori.
"""

import numpy as np

DELIMITADOR = "###FIM###"  # marca o final da mensagem escondida


def _texto_para_bits(texto: str) -> str:
    """Converte uma string em uma sequência de bits (string de '0'/'1')."""
    return "".join(format(ord(c), "08b") for c in texto)


def _bits_para_texto(bits: str) -> str:
    """Converte uma sequência de bits de volta em string (agrupando de 8 em 8)."""
    caracteres = [bits[i:i + 8] for i in range(0, len(bits), 8)]
    return "".join(chr(int(b, 2)) for b in caracteres if len(b) == 8)


def capacidade_maxima(img: np.ndarray) -> int:
    """
    Retorna o número máximo de caracteres que podem ser escondidos na
    imagem (1 bit por pixel, 8 bits por caractere), descontando o
    espaço necessário para o delimitador de fim de mensagem.
    """
    total_pixels = img.size
    max_bits = total_pixels
    max_chars = max_bits // 8
    return max(0, max_chars - len(DELIMITADOR))


def esconder_mensagem(img: np.ndarray, mensagem: str) -> np.ndarray:
    """
    Esconde `mensagem` nos bits menos significativos de `img`.

    Parâmetros
    ----------
    img : np.ndarray
        Imagem em escala de cinza (2D, uint8). Funciona igualmente
        sobre um único canal de uma imagem colorida, se necessário.
    mensagem : str
        Texto a ser escondido (ASCII).

    Retorna
    -------
    np.ndarray
        Cópia da imagem com a mensagem embutida nos LSBs.
    """
    mensagem_completa = mensagem + DELIMITADOR
    bits = _texto_para_bits(mensagem_completa)

    if len(bits) > img.size:
        raise ValueError(
            f"Mensagem muito longa para esta imagem. "
            f"Máximo de {capacidade_maxima(img)} caracteres, "
            f"mensagem tem {len(mensagem)}."
        )

    saida = img.copy().flatten()

    for i, bit in enumerate(bits):
        # Zera o LSB do pixel e insere o novo bit no lugar
        # Ex.: pixel = 11010110, bit = 1 -> 11010111
        saida[i] = (saida[i] & 0b11111110) | int(bit)

    return saida.reshape(img.shape)


def revelar_mensagem(img: np.ndarray) -> str:
    """
    Extrai uma mensagem previamente escondida nos LSBs de `img`.

    Lê o LSB de cada pixel, monta a sequência de bits, converte para
    texto e para assim que encontra o delimitador de fim de mensagem.
    """
    pixels = img.flatten()

    bits_acumulados = ""
    texto_parcial = ""

    for pixel in pixels:
        bits_acumulados += str(pixel & 1)

        # A cada 8 bits acumulados, tenta decodificar mais um caractere
        if len(bits_acumulados) == 8:
            texto_parcial += _bits_para_texto(bits_acumulados)
            bits_acumulados = ""

            if texto_parcial.endswith(DELIMITADOR):
                return texto_parcial[: -len(DELIMITADOR)]

    # Percorreu toda a imagem e não achou o delimitador: não há mensagem
    # válida (ou a imagem foi alterada/comprimida com perdas depois).
    return ""
