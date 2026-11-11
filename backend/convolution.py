"""
convolution.py
--------------
Motor GENÉRICO de convolução espacial (Cap. 3, Seções 3.4 e 3.5).

Este módulo não conhece nenhum filtro específico (média, gaussiano,
laplaciano...) — ele só sabe "aplicar um kernel N x N (N ímpar) sobre
uma imagem, com tratamento de borda, devolvendo o resultado em ponto
flutuante". Quem define os kernels é filters.py.

Separar assim deixa muito claro, na apresentação, a diferença entre:
  - "como" a convolução funciona (este arquivo)
  - "quais" filtros existem (filters.py)

Requisitos atendidos:
  - Suporta qualquer kernel quadrado de dimensão ímpar (3x3, 5x5, 7x7,
    9x9, ou maior).
  - A imagem processada tem o MESMO tamanho da imagem original
    (via tratamento de borda por espelhamento/replicação).
  - Retorna valores em float (podem ser negativos ou > 255) — a
    normalização para EXIBIÇÃO é responsabilidade de quem consome o
    resultado (ver utils.normalize_to_uint8), não desta função.
"""

import numpy as np


def _validar_kernel(kernel: np.ndarray) -> int:
    """
    Garante que o kernel é quadrado e de dimensão ímpar.
    Retorna o "raio" do kernel (quantos pixels para cada lado do centro).
    """
    if kernel.ndim != 2 or kernel.shape[0] != kernel.shape[1]:
        raise ValueError("O kernel deve ser uma matriz quadrada (N x N).")

    n = kernel.shape[0]
    if n % 2 == 0:
        raise ValueError(
            f"O kernel deve ter dimensão ímpar (3x3, 5x5, 7x7, ...). Recebido: {n}x{n}."
        )

    return n // 2


def _adicionar_borda(img: np.ndarray, raio: int) -> np.ndarray:
    """
    Adiciona uma borda à imagem por replicação do pixel mais próximo
    (modo 'edge'), suficiente para que a convolução não "vaze" para
    fora da matriz e para que a imagem de saída tenha o MESMO tamanho
    da imagem de entrada.
    """
    return np.pad(img, pad_width=raio, mode="edge")


def _convoluir_2d(img: np.ndarray, kernel: np.ndarray) -> np.ndarray:
    """
    Aplica a convolução 2D de `kernel` sobre `img`.

    Parâmetros
    ----------
    img : np.ndarray
        Imagem 2D em escala de cinza (uint8 ou float).
    kernel : np.ndarray
        Matriz NxN (N ímpar) com os pesos do filtro. Deve já vir
        "invertida" se o objetivo for convolução matemática pura;
        para os filtros deste trabalho (todos simétricos), convolução
        e correlação produzem o mesmo resultado, então aqui
        implementamos correlação cruzada (mais intuitiva de explicar).

    Retorna
    -------
    np.ndarray (float64)
        Imagem resultante, MESMO tamanho da entrada, sem normalização
        (pode conter valores negativos ou > 255).
    """
    raio = _validar_kernel(kernel)
    n = kernel.shape[0]

    img_float = img.astype(np.float64)
    img_com_borda = _adicionar_borda(img_float, raio)

    altura, largura = img.shape
    saida = np.zeros((altura, largura), dtype=np.float64)

    # Convolução "na força bruta": para cada pixel de saída, soma o
    # produto elemento-a-elemento entre a vizinhança N x N e o kernel.
    # (Implementação didática e explícita: não usa scipy.signal.convolve
    #  nem funções prontas de PDI de alto nível.)
    for i in range(altura):
        for j in range(largura):
            vizinhanca = img_com_borda[i:i + n, j:j + n]
            saida[i, j] = np.sum(vizinhanca * kernel)

    return saida


def _convoluir_vetorizado_2d(img: np.ndarray, kernel: np.ndarray) -> np.ndarray:
    """
    Versão vetorizada (com NumPy stride tricks) da mesma convolução de
    `convoluir`, usada apenas para acelerar imagens grandes ou kernels
    grandes (9x9+) sem mudar o resultado matemático.

    Mantida como função separada e opcional: na apresentação, é fácil
    mostrar primeiro a versão com laços (clara, didática) e depois
    citar esta como otimização de desempenho equivalente.
    """
    raio = _validar_kernel(kernel)
    n = kernel.shape[0]

    img_float = img.astype(np.float64)
    img_com_borda = _adicionar_borda(img_float, raio)

    altura, largura = img.shape

    # Cria uma "view" com todas as janelas N x N sobrepostas, sem copiar
    # dados na memória (sliding_window_view), depois contrai com o kernel.
    janelas = np.lib.stride_tricks.sliding_window_view(img_com_borda, (n, n))
    # janelas.shape == (altura, largura, n, n)

    saida = np.einsum("ijkl,kl->ij", janelas, kernel)
    return saida


# ---------------------------------------------------------------------------
# Interface pública: aceita imagem 2D (cinza) ou 3D (colorida)
# ---------------------------------------------------------------------------

def _por_canal(funcao_2d, img: np.ndarray, kernel: np.ndarray) -> np.ndarray:
    """
    Aplica `funcao_2d` a imagens 2D diretamente e, em imagens (H, W, 3),
    a cada canal separadamente, remontando o resultado como (H, W, 3).

    É assim que "todos os processamentos de escala de cinza passam a
    funcionar com imagens coloridas": a mesma convolução, canal a canal.
    """
    if img.ndim == 2:
        return funcao_2d(img, kernel)
    canais = [funcao_2d(img[:, :, c], kernel) for c in range(img.shape[2])]
    return np.stack(canais, axis=2)


def convoluir(img: np.ndarray, kernel: np.ndarray) -> np.ndarray:
    """
    Convolução com laços explícitos (versão didática). Aceita imagem 2D
    ou 3D; devolve float64 com o MESMO shape da entrada, sem normalizar.
    """
    return _por_canal(_convoluir_2d, img, kernel)


def convoluir_vetorizado(img: np.ndarray, kernel: np.ndarray) -> np.ndarray:
    """
    Mesma convolução, vetorizada (resultado idêntico, muito mais rápida).
    É a versão usada pela API. Aceita imagem 2D ou 3D.
    """
    return _por_canal(_convoluir_vetorizado_2d, img, kernel)
