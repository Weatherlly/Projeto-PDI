"""
fourier.py
----------
Filtragem no domínio da frequência (Cap. 4).

Três implementações da transformada 2D, escolhidas pelo parâmetro `metodo`:

  "fft"    : FFT radix-2 (Cooley-Tukey) escrita aqui, O(N log N).   [própria]
  "dft"    : DFT "ingênua", direto da definição, O(N²) por linha.   [própria]
  "numpy"  : np.fft.fft2 da biblioteca (para comparar e para imagens
             muito grandes, como o enunciado permite).

Fluxo de uma filtragem (`filtrar`):
    imagem -> (preenche com zeros até potência de 2) -> F = FFT2
           -> desloca o espectro (frequência zero no centro)
           -> multiplica pela MÁSCARA desenhada pelo usuário
           -> desfaz o deslocamento -> FFT2 inversa -> parte real
           -> recorta ao tamanho original -> imagem filtrada

A máscara tem valores em [0, 1]: preto (0) elimina aquela frequência,
branco (1) mantém, cinza atenua. Imagens coloridas usam a mesma máscara
em cada canal R, G, B; o espectro EXIBIDO é o da intensidade (média).
"""

import time

import numpy as np

METODOS = ("fft", "dft", "numpy")
LIMITE_DFT_INGENUA = 1024  # lado máximo para a DFT O(N²) (senão leva minutos)


# ---------------------------------------------------------------------------
# Auxiliares de tamanho
# ---------------------------------------------------------------------------

def proxima_potencia_de_2(n: int) -> int:
    """Menor potência de 2 maior ou igual a n (a FFT radix-2 exige isso)."""
    return 1 if n <= 1 else 1 << (n - 1).bit_length()


def tamanho_do_espectro(altura: int, largura: int):
    """(altura, largura) do espectro: lados arredondados para potência de 2."""
    return proxima_potencia_de_2(altura), proxima_potencia_de_2(largura)


def _preencher(canal: np.ndarray, altura_p: int, largura_p: int) -> np.ndarray:
    """Zero-padding: copia o canal no canto superior esquerdo de uma matriz de zeros."""
    saida = np.zeros((altura_p, largura_p), dtype=np.float64)
    saida[:canal.shape[0], :canal.shape[1]] = canal
    return saida


# ---------------------------------------------------------------------------
# DFT ingênua
# ---------------------------------------------------------------------------

def _matriz_dft(n: int) -> np.ndarray:
    """Matriz W[k, m] = exp(-2πi·k·m / n). Multiplicar por ela É a DFT."""
    k = np.arange(n)
    return np.exp(-2j * np.pi * ((np.outer(k, k)) % n) / n)


def dft_2d_ingenua(f: np.ndarray) -> np.ndarray:
    """
    DFT 2D direto da definição:
        F(u,v) = Σx Σy f(x,y) · e^{-2πi (ux/M + vy/N)}
    Como o núcleo é separável, é feita como duas multiplicações de
    matrizes:  F = W_M · f · W_N.  Custo O(M²N + MN²) — por isso o
    limite de tamanho (veja LIMITE_DFT_INGENUA).
    """
    m, n = f.shape
    return _matriz_dft(m) @ f.astype(np.complex128) @ _matriz_dft(n)


# ---------------------------------------------------------------------------
# FFT radix-2 própria
# ---------------------------------------------------------------------------

def _indices_bit_reverso(n: int) -> np.ndarray:
    """Permutação de bit-reversal: o índice i vira i com os bits invertidos."""
    bits = n.bit_length() - 1
    idx = np.arange(n)
    rev = np.zeros(n, dtype=np.int64)
    for b in range(bits):
        rev |= ((idx >> b) & 1) << (bits - 1 - b)
    return rev


def fft_1d(x: np.ndarray) -> np.ndarray:
    """
    FFT radix-2 iterativa (Cooley-Tukey), aplicada ao ÚLTIMO eixo de x.
    O comprimento deve ser potência de 2. Vetorizada: transforma todas
    as linhas de uma matriz de uma só vez.

    Ideia: depois de reordenar a entrada por bit-reversal, combinamos
    pares de transformadas pequenas em transformadas do dobro do tamanho
    ("borboletas"):
        X[k]        = E[k] + W^k · O[k]
        X[k + N/2]  = E[k] - W^k · O[k]        com W = e^{-2πi/N}
    onde E/O são as transformadas dos elementos de índice par/ímpar.
    """
    x = np.asarray(x, dtype=np.complex128)
    n = x.shape[-1]
    if n & (n - 1):
        raise ValueError("fft_1d exige comprimento potência de 2.")
    if n == 1:
        return x.copy()

    a = x[..., _indices_bit_reverso(n)]
    tamanho = 2
    while tamanho <= n:
        metade = tamanho // 2
        w = np.exp(-2j * np.pi * np.arange(metade) / tamanho)
        a = a.reshape(*a.shape[:-1], n // tamanho, tamanho)
        par = a[..., :metade]
        impar = a[..., metade:] * w
        a = np.concatenate([par + impar, par - impar], axis=-1)
        a = a.reshape(*a.shape[:-2], n)
        tamanho *= 2
    return a


def fft_2d(f: np.ndarray) -> np.ndarray:
    """FFT 2D = FFT 1D em todas as linhas, depois em todas as colunas."""
    linhas = fft_1d(f)
    return fft_1d(linhas.T).T


# ---------------------------------------------------------------------------
# Escolha do método (direta e inversa)
# ---------------------------------------------------------------------------

def _validar_metodo(metodo: str, altura: int, largura: int) -> None:
    if metodo not in METODOS:
        raise ValueError(f"metodo deve ser um de {METODOS}.")
    if metodo == "dft" and max(altura, largura) > LIMITE_DFT_INGENUA:
        raise ValueError(
            f"A DFT ingênua (O(N²)) está limitada a {LIMITE_DFT_INGENUA}px de lado "
            f"(o espectro desta imagem é {largura}x{altura}). Use 'fft' ou 'numpy'."
        )


def transformada_2d(f: np.ndarray, metodo: str) -> np.ndarray:
    """Transformada direta 2D pelo método escolhido."""
    if metodo == "fft":
        return fft_2d(f)
    if metodo == "dft":
        return dft_2d_ingenua(f)
    return np.fft.fft2(f)


def inversa_2d(F: np.ndarray, metodo: str) -> np.ndarray:
    """
    Transformada inversa 2D. Usa a identidade
        IDFT(F) = conj( DFT( conj(F) ) ) / (M·N)
    para reaproveitar a mesma transformada direta.
    """
    if metodo == "numpy":
        return np.fft.ifft2(F)
    direta = fft_2d if metodo == "fft" else dft_2d_ingenua
    return np.conj(direta(np.conj(F))) / F.size


# ---------------------------------------------------------------------------
# Deslocamento do espectro (fftshift escrito à mão)
# ---------------------------------------------------------------------------

def deslocar(F: np.ndarray) -> np.ndarray:
    """Leva a frequência (0,0) para o CENTRO da matriz (dimensões pares)."""
    return np.roll(F, shift=(F.shape[0] // 2, F.shape[1] // 2), axis=(0, 1))


def desfazer_deslocamento(F: np.ndarray) -> np.ndarray:
    """Operação inversa de `deslocar`."""
    return np.roll(F, shift=(-(F.shape[0] // 2), -(F.shape[1] // 2)), axis=(0, 1))


# ---------------------------------------------------------------------------
# Espectro para exibição e filtragem
# ---------------------------------------------------------------------------

def _canal_de_exibicao(img: np.ndarray) -> np.ndarray:
    """Imagem colorida -> intensidade (média dos canais); cinza -> ela mesma."""
    return img.astype(np.float64) if img.ndim == 2 else img.astype(np.float64).mean(axis=2)


def espectro_para_exibicao(F_deslocado: np.ndarray) -> np.ndarray:
    """
    Magnitude do espectro em escala logarítmica, levada a [0, 255].
    O log é indispensável: o pico em (0,0) é ordens de grandeza maior
    que o resto, e sem compressão a imagem seria um ponto branco.
    """
    log_mag = np.log1p(np.abs(F_deslocado))
    maximo = log_mag.max()
    if maximo <= 0:
        return np.zeros(F_deslocado.shape, dtype=np.uint8)
    return np.clip(log_mag / maximo * 255.0, 0, 255).astype(np.uint8)


def calcular_espectro(img: np.ndarray, metodo: str = "fft"):
    """
    Retorna (espectro uint8 deslocado, tempo em ms). O espectro tem o
    tamanho "preenchido" (potência de 2); é nesse tamanho que o usuário
    desenha a máscara.
    """
    altura, largura = img.shape[:2]
    altura_p, largura_p = tamanho_do_espectro(altura, largura)
    _validar_metodo(metodo, altura_p, largura_p)

    inicio = time.perf_counter()
    canal = _preencher(_canal_de_exibicao(img), altura_p, largura_p)
    F = deslocar(transformada_2d(canal, metodo))
    espectro = espectro_para_exibicao(F)
    return espectro, (time.perf_counter() - inicio) * 1000.0


def filtrar(img: np.ndarray, mascara: np.ndarray, metodo: str = "fft"):
    """
    Aplica a máscara no domínio da frequência e volta ao domínio espacial.

    Parâmetros
    ----------
    mascara : np.ndarray (altura_p, largura_p), valores em [0, 1]
        Mesmo tamanho do espectro (ver `tamanho_do_espectro`).

    Retorna (imagem uint8 do tamanho original, tempo em ms).

    Observação: se a máscara desenhada não for simétrica em relação ao
    centro, a inversa tem parte imaginária; ela é descartada (parte
    real), o que equivale a simetrizar a máscara.
    """
    altura, largura = img.shape[:2]
    altura_p, largura_p = tamanho_do_espectro(altura, largura)
    _validar_metodo(metodo, altura_p, largura_p)

    if mascara.shape != (altura_p, largura_p):
        raise ValueError(
            f"A máscara deve ter {largura_p}x{altura_p}px (o tamanho do espectro); "
            f"recebi {mascara.shape[1]}x{mascara.shape[0]}."
        )
    mascara = np.clip(mascara, 0.0, 1.0)

    def filtrar_canal(canal):
        F = deslocar(transformada_2d(_preencher(canal, altura_p, largura_p), metodo))
        F = desfazer_deslocamento(F * mascara)
        espacial = np.real(inversa_2d(F, metodo))
        return espacial[:altura, :largura]

    inicio = time.perf_counter()
    if img.ndim == 2:
        resultado = filtrar_canal(img.astype(np.float64))
    else:
        resultado = np.stack(
            [filtrar_canal(img[:, :, c].astype(np.float64)) for c in range(img.shape[2])],
            axis=2,
        )
    saida = np.clip(np.rint(resultado), 0, 255).astype(np.uint8)
    return saida, (time.perf_counter() - inicio) * 1000.0
