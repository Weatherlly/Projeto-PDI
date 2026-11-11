"""
api.py
------
Camada de API (FastAPI) que expõe cada módulo de PDI como um endpoint
HTTP, para ser consumida pelo front-end React.

Este é o ÚNICO arquivo que "conhece" o mundo HTTP/JSON — os módulos de
PDI (intensity, steganography, histogram, convolution, filters, edges,
geometry, fourier, color) trabalham só com arrays NumPy.

Imagens coloridas: toda rota carrega a imagem com `_carregar`, que
preserva os canais (2D = cinza, 3D = RGB). Os módulos tratam as duas
formas, então o mesmo endpoint serve para cinza e para cor.

Rodar localmente:
    uvicorn api:app --reload --port 8000

Rodar no Google Colab: ver docs/colab_setup.md
"""

from typing import Dict, List, Optional

import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import UnidentifiedImageError
from pydantic import BaseModel

import color
import convolution
import edges
import filters
import fourier
import geometry
import histogram
import intensity
import steganography
import utils

app = FastAPI(title="Mini-GIMP PDI API", version="2.0.0")

# CORS liberado: front-end (Vercel) e back-end (Colab/Ngrok) ficam em domínios
# diferentes e a URL do Ngrok muda a cada sessão.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Erros: ValueError dos módulos de PDI vira HTTP 400 com mensagem legível
# ---------------------------------------------------------------------------

@app.exception_handler(ValueError)
async def tratar_value_error(_request, exc: ValueError):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(UnidentifiedImageError)
async def tratar_imagem_invalida(_request, _exc):
    return JSONResponse(status_code=400, content={"detail": "O arquivo enviado não é uma imagem válida."})


# ---------------------------------------------------------------------------
# Helpers de entrada/saída
# ---------------------------------------------------------------------------

def _carregar(b64: str) -> np.ndarray:
    """base64 -> array 2D (cinza) ou 3D (RGB), uint8."""
    return utils.pil_to_array(utils.base64_to_pil(b64))


def _para_b64(arr: np.ndarray) -> str:
    return utils.pil_to_base64(utils.array_to_pil(arr))


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ImagemEntrada(BaseModel):
    imagem_base64: str


class ImagemSaida(BaseModel):
    imagem_base64: str


def _responder(arr: np.ndarray) -> ImagemSaida:
    """array -> JSON com a imagem em PNG base64."""
    return ImagemSaida(imagem_base64=_para_b64(arr))


class LimiarizacaoRequest(ImagemEntrada):
    limiar: int = 128


class BrilhoRequest(ImagemEntrada):
    delta: int


class GamaRequest(ImagemEntrada):
    gama: float
    c: float = 1.0


class PontoControle(BaseModel):
    r: int
    s: int


class LinearPorPartesRequest(ImagemEntrada):
    pontos: List[PontoControle]


class EsconderMensagemRequest(ImagemEntrada):
    mensagem: str


class RevelarMensagemResponse(BaseModel):
    mensagem: str


class HistogramasResponse(BaseModel):
    # {"cinza": [...256]}  ou  {"r": [...], "g": [...], "b": [...], "i": [...]}
    canais: Dict[str, List[int]]


class FiltroTamanhoRequest(ImagemEntrada):
    tamanho: int = 3


class GaussianoRequest(FiltroTamanhoRequest):
    sigma: Optional[float] = None


class LaplacianoRequest(ImagemEntrada):
    variante: str = "4-conexo"


class HighBoostRequest(ImagemEntrada):
    tamanho_blur: int = 3
    k: float = 1.5


class FiltroGenericoRequest(ImagemEntrada):
    kernel: List[List[float]]
    normalizar: bool = True


class EscalaRequest(ImagemEntrada):
    sx: float = 1.0
    sy: float = 1.0
    interpolacao: str = "bilinear"  # "vizinho" | "bilinear"


class RotacaoRequest(ImagemEntrada):
    angulo: float = 0.0
    pivo_x: Optional[float] = None  # None (em x ou y) = centro da imagem
    pivo_y: Optional[float] = None
    interpolacao: str = "bilinear"
    canvas: str = "ajustar"  # "ajustar" | "uniao" | "manter"


class EspectroRequest(ImagemEntrada):
    metodo: str = "fft"  # "fft" (própria) | "dft" (própria, ingênua) | "numpy"


class EspectroResponse(BaseModel):
    espectro_base64: str
    largura: int  # tamanho do espectro (potência de 2) = tamanho da máscara
    altura: int
    tempo_ms: float


class FiltrarFrequenciaRequest(ImagemEntrada):
    mascara_base64: str  # PNG do tamanho do espectro: preto=remove, branco=mantém
    metodo: str = "fft"


class FiltrarFrequenciaResponse(BaseModel):
    imagem_base64: str
    tempo_ms: float


class HsiCanaisRequest(BaseModel):
    h_base64: str
    s_base64: str
    i_base64: str


class HsiCanaisResponse(HsiCanaisRequest):
    pass


class CinzaRequest(ImagemEntrada):
    metodo: str = "ponderada"  # "media" | "ponderada"


class ChromaKeyRequest(ImagemEntrada):
    fundo_base64: str
    cor_chave: List[int] = [0, 255, 0]
    distancia: float = 100.0


class AjusteHsiRequest(ImagemEntrada):
    delta_matiz: float = 0.0
    fator_saturacao: float = 1.0
    delta_brilho: float = 0.0


class AjusteCanalRequest(ImagemEntrada):
    deltas: List[float] = [0, 0, 0]
    modelo: str = "rgb"  # "rgb" | "cmy"


# ---------------------------------------------------------------------------
# Saúde
# ---------------------------------------------------------------------------

@app.get("/")
def raiz():
    """Endpoint simples para o front-end testar a conexão com o backend."""
    return {"status": "ok", "mensagem": "Mini-GIMP PDI API no ar."}


# ---------------------------------------------------------------------------
# intensity.py  (funcionam em cinza e em cor: operação ponto a ponto por canal)
# ---------------------------------------------------------------------------

@app.post("/intensidade/negativo", response_model=ImagemSaida)
def rota_negativo(req: ImagemEntrada):
    return _responder(utils.clip_to_uint8(intensity.negativo(_carregar(req.imagem_base64))))


@app.post("/intensidade/limiarizacao", response_model=ImagemSaida)
def rota_limiarizacao(req: LimiarizacaoRequest):
    return _responder(intensity.limiarizacao(_carregar(req.imagem_base64), req.limiar))


@app.post("/intensidade/brilho", response_model=ImagemSaida)
def rota_brilho(req: BrilhoRequest):
    return _responder(intensity.ajuste_brilho(_carregar(req.imagem_base64), req.delta))


@app.post("/intensidade/gama", response_model=ImagemSaida)
def rota_gama(req: GamaRequest):
    return _responder(intensity.correcao_gama(_carregar(req.imagem_base64), req.gama, req.c))


@app.post("/intensidade/linear-por-partes", response_model=ImagemSaida)
def rota_linear_por_partes(req: LinearPorPartesRequest):
    pontos = [(p.r, p.s) for p in req.pontos]
    return _responder(intensity.transformacao_linear_por_partes(_carregar(req.imagem_base64), pontos))


# ---------------------------------------------------------------------------
# steganography.py  (em cor, os 3 canais carregam bits: 3x mais capacidade)
# ---------------------------------------------------------------------------

@app.post("/esteganografia/esconder", response_model=ImagemSaida)
def rota_esconder_mensagem(req: EsconderMensagemRequest):
    return _responder(steganography.esconder_mensagem(_carregar(req.imagem_base64), req.mensagem))


@app.post("/esteganografia/revelar", response_model=RevelarMensagemResponse)
def rota_revelar_mensagem(req: ImagemEntrada):
    return RevelarMensagemResponse(mensagem=steganography.revelar_mensagem(_carregar(req.imagem_base64)))


# ---------------------------------------------------------------------------
# histogram.py  (cinza: 1 histograma; cor: R, G, B e I)
# ---------------------------------------------------------------------------

@app.post("/histograma/calcular", response_model=HistogramasResponse)
def rota_calcular_histograma(req: ImagemEntrada):
    hists = histogram.histogramas_cor(_carregar(req.imagem_base64))
    return HistogramasResponse(canais={nome: h.tolist() for nome, h in hists.items()})


@app.post("/histograma/equalizar", response_model=ImagemSaida)
def rota_equalizar_histograma(req: ImagemEntrada):
    """Cinza: equalização direta. Cor: equaliza apenas o canal I do HSI."""
    img = _carregar(req.imagem_base64)
    if utils.eh_colorida(img):
        return _responder(color.equalizar_histograma_hsi(img))
    return _responder(histogram.equalizar_histograma(img))


# ---------------------------------------------------------------------------
# filters.py + convolution.py
# ---------------------------------------------------------------------------

@app.post("/filtros/media", response_model=ImagemSaida)
def rota_filtro_media(req: FiltroTamanhoRequest):
    return _responder(filters.filtro_media(_carregar(req.imagem_base64), req.tamanho))


@app.post("/filtros/gaussiano", response_model=ImagemSaida)
def rota_filtro_gaussiano(req: GaussianoRequest):
    return _responder(filters.filtro_gaussiano(_carregar(req.imagem_base64), req.tamanho, req.sigma))


@app.post("/filtros/mediana", response_model=ImagemSaida)
def rota_filtro_mediana(req: FiltroTamanhoRequest):
    return _responder(filters.filtro_mediana(_carregar(req.imagem_base64), req.tamanho))


@app.post("/filtros/laplaciano", response_model=ImagemSaida)
def rota_aguçamento_laplaciano(req: LaplacianoRequest):
    return _responder(filters.aguçamento_laplaciano(_carregar(req.imagem_base64), req.variante))


@app.post("/filtros/high-boost", response_model=ImagemSaida)
def rota_aguçamento_high_boost(req: HighBoostRequest):
    return _responder(filters.aguçamento_high_boost(_carregar(req.imagem_base64), req.tamanho_blur, req.k))


@app.post("/filtros/generico", response_model=ImagemSaida)
def rota_filtro_generico(req: FiltroGenericoRequest):
    kernel = np.array(req.kernel, dtype=np.float64)
    return _responder(filters.aplicar_filtro_generico(_carregar(req.imagem_base64), kernel, req.normalizar))


# ---------------------------------------------------------------------------
# edges.py
# ---------------------------------------------------------------------------

@app.post("/bordas/sobel-x", response_model=ImagemSaida)
def rota_sobel_x(req: ImagemEntrada):
    return _responder(edges.sobel_x(_carregar(req.imagem_base64)))


@app.post("/bordas/sobel-y", response_model=ImagemSaida)
def rota_sobel_y(req: ImagemEntrada):
    return _responder(edges.sobel_y(_carregar(req.imagem_base64)))


@app.post("/bordas/gradiente", response_model=ImagemSaida)
def rota_gradiente(req: ImagemEntrada):
    return _responder(edges.magnitude_gradiente(_carregar(req.imagem_base64)))


# ---------------------------------------------------------------------------
# geometry.py
# ---------------------------------------------------------------------------

@app.post("/geometria/escala", response_model=ImagemSaida)
def rota_escala(req: EscalaRequest):
    return _responder(geometry.escala(_carregar(req.imagem_base64), req.sx, req.sy, req.interpolacao))


@app.post("/geometria/rotacao", response_model=ImagemSaida)
def rota_rotacao(req: RotacaoRequest):
    pivo = None
    if req.pivo_x is not None and req.pivo_y is not None:
        pivo = (req.pivo_x, req.pivo_y)
    return _responder(
        geometry.rotacao(_carregar(req.imagem_base64), req.angulo, pivo, req.interpolacao, req.canvas)
    )


# ---------------------------------------------------------------------------
# fourier.py
# ---------------------------------------------------------------------------

@app.post("/frequencia/espectro", response_model=EspectroResponse)
def rota_espectro(req: EspectroRequest):
    espectro, tempo = fourier.calcular_espectro(_carregar(req.imagem_base64), req.metodo)
    altura, largura = espectro.shape
    return EspectroResponse(
        espectro_base64=_para_b64(espectro),
        largura=largura,
        altura=altura,
        tempo_ms=round(tempo, 1),
    )


@app.post("/frequencia/filtrar", response_model=FiltrarFrequenciaResponse)
def rota_filtrar_frequencia(req: FiltrarFrequenciaRequest):
    img = _carregar(req.imagem_base64)
    mascara_img = utils.pil_to_array(utils.base64_to_pil(req.mascara_base64))
    if mascara_img.ndim == 3:  # PNG de canvas vem RGB: usa a média dos canais
        mascara_img = mascara_img.astype(np.float64).mean(axis=2)
    mascara = mascara_img.astype(np.float64) / 255.0

    resultado, tempo = fourier.filtrar(img, mascara, req.metodo)
    return FiltrarFrequenciaResponse(imagem_base64=_para_b64(resultado), tempo_ms=round(tempo, 1))


# ---------------------------------------------------------------------------
# color.py
# ---------------------------------------------------------------------------

@app.post("/cores/rgb-para-hsi", response_model=HsiCanaisResponse)
def rota_rgb_para_hsi(req: ImagemEntrada):
    h8, s8, i8 = color.hsi_para_canais_uint8(_carregar(req.imagem_base64))
    return HsiCanaisResponse(h_base64=_para_b64(h8), s_base64=_para_b64(s8), i_base64=_para_b64(i8))


@app.post("/cores/hsi-para-rgb", response_model=ImagemSaida)
def rota_hsi_para_rgb(req: HsiCanaisRequest):
    h8, s8, i8 = (utils.pil_to_gray_array(utils.base64_to_pil(b))
                  for b in (req.h_base64, req.s_base64, req.i_base64))
    if not (h8.shape == s8.shape == i8.shape):
        raise ValueError("As imagens H, S e I devem ter o mesmo tamanho.")
    return _responder(color.canais_uint8_para_rgb(h8, s8, i8))


@app.post("/cores/cinza", response_model=ImagemSaida)
def rota_cinza(req: CinzaRequest):
    return _responder(color.escala_de_cinza(_carregar(req.imagem_base64), req.metodo))


@app.post("/cores/chroma-key", response_model=ImagemSaida)
def rota_chroma_key(req: ChromaKeyRequest):
    if len(req.cor_chave) != 3:
        raise ValueError("cor_chave deve ter 3 valores (R, G, B).")
    return _responder(color.chroma_key(
        _carregar(req.imagem_base64), _carregar(req.fundo_base64),
        tuple(req.cor_chave), req.distancia,
    ))


@app.post("/cores/ajuste-hsi", response_model=ImagemSaida)
def rota_ajuste_hsi(req: AjusteHsiRequest):
    return _responder(color.ajuste_hsi(
        _carregar(req.imagem_base64), req.delta_matiz, req.fator_saturacao, req.delta_brilho,
    ))


@app.post("/cores/ajuste-canal", response_model=ImagemSaida)
def rota_ajuste_canal(req: AjusteCanalRequest):
    return _responder(color.ajuste_canais(_carregar(req.imagem_base64), req.deltas, req.modelo))


@app.post("/cores/sepia", response_model=ImagemSaida)
def rota_sepia(req: ImagemEntrada):
    return _responder(color.sepia(_carregar(req.imagem_base64)))
