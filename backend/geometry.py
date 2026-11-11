"""
geometry.py
-----------
Operações espaciais: escala e rotação, com interpolação pelo vizinho
mais próximo e bilinear (Cap. 2, Seção 2.6.5). Rotação com pivô.

Mesma ideia dos modelos escala.m e rotacao.m da disciplina:
MAPEAMENTO INVERSO. Em vez de empurrar cada pixel da origem para o
destino (o que deixa buracos), percorremos cada pixel do DESTINO,
calculamos de que ponto (fracionário) da imagem de ORIGEM ele veio e
interpolamos o valor ali.

Diferenças em relação aos modelos em Octave:
  - vetorizado com NumPy (sem laços), com resultado equivalente;
  - tanto a escala quanto a rotação aceitam as duas interpolações;
  - coordenadas 0-indexadas, com pixel no CENTRO da célula na escala;
  - na escala, a borda é replicada (o modelo zerava a última linha e
    coluna, deixando uma moldura preta);
  - a rotação aceita pivô e três modos de tela (ver `rotacao`).

Convenções: x = coluna, y = linha, origem no canto superior esquerdo.
Funciona em imagens 2D (cinza) e 3D (H, W, 3).
"""

import math

import numpy as np

INTERPOLACOES = ("vizinho", "bilinear")
LIMITE_PIXELS = 40_000_000  # evita estourar a memória do Colab


def _validar_interpolacao(interpolacao: str) -> None:
    if interpolacao not in INTERPOLACOES:
        raise ValueError(f"Interpolação deve ser uma de {INTERPOLACOES}.")


def _validar_tamanho(altura: int, largura: int) -> None:
    if altura < 1 or largura < 1:
        raise ValueError("A imagem resultante teria tamanho zero.")
    if altura * largura > LIMITE_PIXELS:
        raise ValueError(
            f"Resultado grande demais ({largura}x{altura}). "
            f"Limite: {LIMITE_PIXELS:,} pixels."
        )


# ---------------------------------------------------------------------------
# Amostragem com interpolação
# ---------------------------------------------------------------------------

def amostrar(img: np.ndarray, x: np.ndarray, y: np.ndarray,
             interpolacao: str, fora: float = 0.0) -> np.ndarray:
    """
    Lê a imagem nas coordenadas fracionárias (x, y) — arrays de mesmo
    shape — usando a interpolação escolhida. Coordenadas fora da imagem
    ([0, W-1] x [0, H-1]) recebem o valor `fora` (preto por padrão).

    Retorna float64, com shape x.shape (+ canais, se a imagem for 3D).
    """
    _validar_interpolacao(interpolacao)
    altura, largura = img.shape[:2]
    f = img.astype(np.float64)

    # tolerância de 1e-6: coordenadas como -1e-15 (ruído de seno/cosseno)
    # pertencem ao pixel de borda, não estão "fora" da imagem.
    tol = 1e-6
    dentro = ((x >= -tol) & (x <= largura - 1 + tol) &
              (y >= -tol) & (y <= altura - 1 + tol))

    if interpolacao == "vizinho":
        # arredonda para o pixel mais próximo (0.5 sobe)
        xi = np.clip(np.floor(x + 0.5).astype(np.int64), 0, largura - 1)
        yi = np.clip(np.floor(y + 0.5).astype(np.int64), 0, altura - 1)
        valor = f[yi, xi]
    else:
        # bilinear: média ponderada dos 4 vizinhos, igual ao escala.m:
        #   cor1 = (1-py)*A + py*C ; cor2 = (1-py)*B + py*D
        #   cor  = (1-px)*cor1 + px*cor2
        x0 = np.floor(x).astype(np.int64)
        y0 = np.floor(y).astype(np.int64)
        px = x - x0
        py = y - y0

        x0c = np.clip(x0, 0, largura - 1)
        x1c = np.clip(x0 + 1, 0, largura - 1)
        y0c = np.clip(y0, 0, altura - 1)
        y1c = np.clip(y0 + 1, 0, altura - 1)

        if img.ndim == 3:
            px = px[..., None]
            py = py[..., None]

        cor1 = (1 - py) * f[y0c, x0c] + py * f[y1c, x0c]
        cor2 = (1 - py) * f[y0c, x1c] + py * f[y1c, x1c]
        valor = (1 - px) * cor1 + px * cor2

    mascara = dentro[..., None] if img.ndim == 3 else dentro
    return np.where(mascara, valor, fora)


def _para_uint8(valor: np.ndarray) -> np.ndarray:
    return np.clip(np.rint(valor), 0, 255).astype(np.uint8)


# ---------------------------------------------------------------------------
# Escala
# ---------------------------------------------------------------------------

def redimensionar(img: np.ndarray, nova_altura: int, nova_largura: int,
                  interpolacao: str = "bilinear") -> np.ndarray:
    """Redimensiona para exatamente (nova_altura x nova_largura) pixels."""
    _validar_tamanho(nova_altura, nova_largura)
    altura, largura = img.shape[:2]

    yy, xx = np.meshgrid(np.arange(nova_altura), np.arange(nova_largura), indexing="ij")

    # Alinha os CENTROS dos pixels: o pixel c do destino cobre
    # [c, c+1) e seu centro é c+0.5, que corresponde a
    # (c+0.5)*(largura/nova_largura) no sistema da origem.
    x = (xx + 0.5) * (largura / nova_largura) - 0.5
    y = (yy + 0.5) * (altura / nova_altura) - 0.5

    # Dentro da escala nunca há "fora da imagem": replica a borda.
    x = np.clip(x, 0, largura - 1)
    y = np.clip(y, 0, altura - 1)

    return _para_uint8(amostrar(img, x, y, interpolacao))


def escala(img: np.ndarray, sx: float, sy: float,
           interpolacao: str = "bilinear") -> np.ndarray:
    """
    Escala a imagem por fatores (sx, sy) — como em escala(img, sx, sy):
    a imagem resultante tem round(sx*largura) colunas e round(sy*altura)
    linhas. Fatores < 1 reduzem, > 1 ampliam, e podem ser diferentes
    (distorção proposital de proporção).
    """
    if sx <= 0 or sy <= 0:
        raise ValueError("Os fatores de escala devem ser positivos.")
    altura, largura = img.shape[:2]
    # Arredondamento "meio para cima", igual ao round() do Octave usado no
    # escala.m (o round() do Python arredondaria 22.5 para 22, o Octave para 23).
    nova_altura = max(1, int(math.floor(sy * altura + 0.5)))
    nova_largura = max(1, int(math.floor(sx * largura + 0.5)))
    return redimensionar(img, nova_altura, nova_largura, interpolacao)


# ---------------------------------------------------------------------------
# Rotação
# ---------------------------------------------------------------------------

CANVAS_MODOS = ("ajustar", "uniao", "manter")


def rotacao(img: np.ndarray, angulo: float, pivo=None,
            interpolacao: str = "bilinear", canvas: str = "ajustar") -> np.ndarray:
    """
    Rotaciona a imagem `angulo` graus em torno de um PIVÔ.

    Parâmetros
    ----------
    angulo : float
        Em graus; positivo = sentido ANTI-HORÁRIO, como se vê na tela.
    pivo : (x, y) ou None
        Ponto fixo da rotação, em coordenadas de pixel da imagem
        original (x = coluna, y = linha, origem no canto superior
        esquerdo). None = centro da imagem. Pode estar fora da imagem.
    interpolacao : "vizinho" | "bilinear"
    canvas : como escolher o tamanho da imagem de saída
        "ajustar" : caixa mínima que contém a imagem girada (comportamento
                    do rotacao.m). Nada é cortado; o pivô só desloca o
                    resultado dentro dessa caixa, então não muda o aspecto.
        "uniao"   : caixa que contém a imagem original E a girada. Aqui o
                    pivô fica visível: mostra para onde a imagem "andou".
        "manter"  : mesmo tamanho da original (o que sair da tela é cortado).
                    O pivô é o ponto que permanece no lugar.

    Pixels do destino sem correspondente na origem ficam pretos.
    """
    _validar_interpolacao(interpolacao)
    if canvas not in CANVAS_MODOS:
        raise ValueError(f"canvas deve ser um de {CANVAS_MODOS}.")

    altura, largura = img.shape[:2]
    if pivo is None:
        pivo = ((largura - 1) / 2.0, (altura - 1) / 2.0)
    px, py = float(pivo[0]), float(pivo[1])

    theta = math.radians(angulo)
    cos_t, sin_t = math.cos(theta), math.sin(theta)

    # Rotação direta (anti-horária na tela, com y apontando para baixo):
    #   dx' =  dx*cos + dy*sin ;  dy' = -dx*sin + dy*cos
    def girar(x, y):
        dx, dy = x - px, y - py
        return px + dx * cos_t + dy * sin_t, py - dx * sin_t + dy * cos_t

    cantos = [(0, 0), (largura - 1, 0), (largura - 1, altura - 1), (0, altura - 1)]
    girados = [girar(x, y) for x, y in cantos]

    if canvas == "manter":
        x_min, y_min = 0, 0
        nova_largura, nova_altura = largura, altura
    else:
        pontos = list(girados)
        if canvas == "uniao":
            pontos += cantos
        # round(..., 6): remove ruído de ponto flutuante (ex.: sin(2π) ≈ 2e-16)
        # que faria floor/ceil criar uma linha/coluna extra à toa.
        x_min = math.floor(round(min(p[0] for p in pontos), 6))
        x_max = math.ceil(round(max(p[0] for p in pontos), 6))
        y_min = math.floor(round(min(p[1] for p in pontos), 6))
        y_max = math.ceil(round(max(p[1] for p in pontos), 6))
        nova_largura = int(x_max - x_min + 1)
        nova_altura = int(y_max - y_min + 1)

    _validar_tamanho(nova_altura, nova_largura)

    # Mapeamento inverso: para cada pixel do destino, gira -angulo em
    # torno do pivô para descobrir a posição de origem.
    yy, xx = np.meshgrid(np.arange(nova_altura), np.arange(nova_largura), indexing="ij")
    dx = (xx + x_min) - px
    dy = (yy + y_min) - py
    x_origem = px + dx * cos_t - dy * sin_t
    y_origem = py + dx * sin_t + dy * cos_t

    return _para_uint8(amostrar(img, x_origem, y_origem, interpolacao, fora=0.0))
