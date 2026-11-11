"""
filters.py
----------
Filtros espaciais específicos (Cap. 3, Seções 3.4, 3.5, 3.6.1, 3.6.2, 3.6.3).

Este módulo apenas DEFINE os kernels e a lógica de cada filtro; quem
efetivamente aplica a convolução é o motor genérico em convolution.py
(ou, no caso do filtro de mediana, uma lógica de vizinhança própria,
pois mediana não é uma operação linear e não pode ser expressa como
convolução).

Todas as funções devolvem o resultado JÁ NORMALIZADO para uint8
quando o objetivo é exibição (ver docstring de cada uma), usando
utils.normalize_to_uint8 conforme exigido no enunciado.
"""

import numpy as np

import convolution
import utils


# ---------------------------------------------------------------------------
# Construtores de kernel
# ---------------------------------------------------------------------------

def kernel_media(tamanho: int) -> np.ndarray:
    """
    Kernel de média (suavização) simples: todos os pesos iguais,
    somando 1 (para não alterar o brilho médio da imagem).

        kernel = (1 / (n*n)) * matriz de 1s
    """
    return np.ones((tamanho, tamanho), dtype=np.float64) / (tamanho * tamanho)


def kernel_gaussiano(tamanho: int, sigma: float = None) -> np.ndarray:
    """
    Kernel gaussiano (média ponderada): pesos maiores no centro,
    decaindo suavemente conforme a distância ao centro aumenta —
    aproxima melhor um borrão "natural" do que a média simples.

    Fórmula: G(x, y) = exp(-(x² + y²) / (2*sigma²)), depois normalizado
    para que a soma de todos os pesos seja 1.

    Parâmetros
    ----------
    sigma : float, opcional
        Desvio padrão da gaussiana. Se não informado, usa uma regra
        prática: sigma = tamanho / 6 (garante que o kernel cubra
        aproximadamente 3 desvios padrão para cada lado do centro).
    """
    if sigma is None:
        sigma = tamanho / 6.0
        if sigma <= 0:
            sigma = 1.0

    raio = tamanho // 2
    eixo = np.arange(-raio, raio + 1)
    x, y = np.meshgrid(eixo, eixo)

    kernel = np.exp(-(x**2 + y**2) / (2 * sigma**2))
    kernel = kernel / kernel.sum()  # normaliza para soma = 1

    return kernel


def kernel_laplaciano(variante: str = "4-conexo") -> np.ndarray:
    """
    Kernel laplaciano 3x3, usado para detectar variações bruscas de
    intensidade (bordas) — base do aguçamento por Laplaciano.

    Parâmetros
    ----------
    variante : str
        "4-conexo": considera só vizinhos ortogonais (cima/baixo/esq/dir).
        "8-conexo": considera também os vizinhos diagonais (mais sensível).
    """
    if variante == "4-conexo":
        return np.array([
            [0,  1, 0],
            [1, -4, 1],
            [0,  1, 0],
        ], dtype=np.float64)

    if variante == "8-conexo":
        return np.array([
            [1,  1, 1],
            [1, -8, 1],
            [1,  1, 1],
        ], dtype=np.float64)

    raise ValueError("variante deve ser '4-conexo' ou '8-conexo'.")


# ---------------------------------------------------------------------------
# Filtros de suavização
# ---------------------------------------------------------------------------

def filtro_media(img: np.ndarray, tamanho: int) -> np.ndarray:
    """
    Aplica suavização por média simples (blur uniforme).

    Parâmetros
    ----------
    tamanho : int
        Dimensão do kernel (deve ser ímpar: 3, 5, 7, 9, ...).
    """
    kernel = kernel_media(tamanho)
    resultado = convolution.convoluir_vetorizado(img, kernel)
    # Média nunca produz valores negativos nem > 255 (pesos positivos
    # somando 1), então clip é suficiente — não precisa normalizar.
    return utils.clip_to_uint8(resultado)


def filtro_gaussiano(img: np.ndarray, tamanho: int, sigma: float = None) -> np.ndarray:
    """
    Aplica suavização gaussiana (blur ponderado, mais natural que a média).

    Parâmetros
    ----------
    tamanho : int
        Dimensão do kernel (ímpar: 3, 5, 7, 9, ...).
    sigma : float, opcional
        Controla a intensidade do borrão (maior sigma = mais borrado).
    """
    kernel = kernel_gaussiano(tamanho, sigma)
    resultado = convolution.convoluir_vetorizado(img, kernel)
    return utils.clip_to_uint8(resultado)


def _mediana_2d(canal: np.ndarray, tamanho: int) -> np.ndarray:
    """
    Mediana deslizante de um canal 2D. Para cada pixel, ordena os
    tamanho*tamanho valores da vizinhança e fica com o do meio.

    Usa sliding_window_view (janelas sem copiar memória) e processa
    em blocos de linhas, para não estourar a RAM do Colab com kernels
    grandes (um 9x9 guarda 81 valores por pixel).
    """
    raio = tamanho // 2
    altura, largura = canal.shape
    com_borda = np.pad(canal, pad_width=raio, mode="edge")
    janelas = np.lib.stride_tricks.sliding_window_view(com_borda, (tamanho, tamanho))

    saida = np.empty((altura, largura), dtype=np.uint8)
    linhas_por_bloco = max(1, 4_000_000 // (largura * tamanho * tamanho))

    for inicio in range(0, altura, linhas_por_bloco):
        bloco = janelas[inicio:inicio + linhas_por_bloco]
        bloco = bloco.reshape(bloco.shape[0], largura, tamanho * tamanho)
        saida[inicio:inicio + linhas_por_bloco] = np.median(bloco, axis=2)

    return saida


def filtro_mediana(img: np.ndarray, tamanho: int) -> np.ndarray:
    """
    Filtro de mediana: substitui cada pixel pela MEDIANA dos valores
    na sua vizinhança N x N (em imagens coloridas, canal a canal).

    A mediana é uma operação NÃO-LINEAR: não existe um kernel de pesos
    fixos cuja soma ponderada produza a mediana, então ela não passa
    pelo motor de convolução — a vizinhança é tratada à parte.
    Muito eficaz contra ruído "sal e pimenta", preservando bordas.
    """
    if tamanho % 2 == 0 or tamanho < 1:
        raise ValueError("O tamanho do filtro de mediana deve ser ímpar.")

    if img.ndim == 2:
        return _mediana_2d(img, tamanho)
    canais = [_mediana_2d(img[:, :, c], tamanho) for c in range(img.shape[2])]
    return np.stack(canais, axis=2)


# ---------------------------------------------------------------------------
# Filtros de aguçamento (sharpening)
# ---------------------------------------------------------------------------

def aguçamento_laplaciano(img: np.ndarray, variante: str = "4-conexo") -> np.ndarray:
    """
    Aguçamento (realce de nitidez) por Laplaciano:

        s = r - laplaciano(r)      (quando o centro do kernel é negativo,
                                     como nos kernels definidos acima)

    O laplaciano realça regiões de mudança brusca de intensidade
    (bordas); subtraindo-o da imagem original, essas regiões ganham
    mais contraste, dando sensação de nitidez.

    Retorna a imagem final JÁ SATURADA em [0, 255] (resultado de uso
    direto, não um mapa de bordas para inspeção — por isso usamos
    clip, não normalize).
    """
    kernel = kernel_laplaciano(variante)
    laplaciano = convolution.convoluir_vetorizado(img, kernel)

    # Como o centro do kernel é negativo, "imagem - laplaciano" equivale
    # a "imagem + |realce de bordas|" — por isso SOMAMOS aqui.
    resultado = img.astype(np.float64) + laplaciano
    return utils.clip_to_uint8(resultado)


def aguçamento_high_boost(img: np.ndarray, tamanho_blur: int, k: float = 1.5) -> np.ndarray:
    """
    Aguçamento por High-Boost:

        1. Gera uma versão borrada da imagem (passa-baixa) com média/gaussiano;
        2. Calcula a "máscara" = imagem original - imagem borrada
           (isso isola os detalhes de alta frequência / bordas);
        3. Resultado = imagem original + k * máscara

    Quando k = 1, isso é equivalente ao "unsharp masking" clássico.
    Quando k > 1, exagera ainda mais o realce (daí o nome "high-boost").

    Parâmetros
    ----------
    tamanho_blur : int
        Tamanho do kernel usado para gerar a versão borrada (ímpar).
    k : float
        Fator de amplificação do realce (k >= 1 tipicamente).
    """
    kernel_blur = kernel_gaussiano(tamanho_blur)
    borrada = convolution.convoluir_vetorizado(img, kernel_blur)

    img_float = img.astype(np.float64)
    mascara = img_float - borrada  # detalhes de alta frequência

    resultado = img_float + k * mascara
    return utils.clip_to_uint8(resultado)


# ---------------------------------------------------------------------------
# Filtro genérico exposto ao usuário (para a UI de "escolher tamanho/kernel")
# ---------------------------------------------------------------------------

def aplicar_filtro_generico(img: np.ndarray, kernel: np.ndarray, normalizar: bool = True) -> np.ndarray:
    """
    Aplica um kernel arbitrário fornecido pelo usuário (ex.: via UI de
    "filtro personalizado") e devolve o resultado pronto para exibição.

    Parâmetros
    ----------
    kernel : np.ndarray
        Matriz NxN (N ímpar) definida pelo usuário.
    normalizar : bool
        Se True (padrão), normaliza o resultado para [0, 255] antes de
        devolver — necessário porque um kernel arbitrário pode gerar
        valores bem fora da faixa de exibição (conforme observado no
        enunciado). Se False, apenas satura (clip) — use quando o
        kernel é conhecidamente "seguro" (pesos positivos somando 1).
    """
    resultado = convolution.convoluir_vetorizado(img, kernel)

    if normalizar:
        return utils.normalize_to_uint8(resultado)
    return utils.clip_to_uint8(resultado)
