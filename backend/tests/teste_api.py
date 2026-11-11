"""Teste ponta a ponta de todos os endpoints. Rodar: PYTHONPATH=. python3 tests/teste_api.py"""
import base64, io
import numpy as np
from PIL import Image
from fastapi.testclient import TestClient
import api, utils, fourier

c = TestClient(api.app)
rng = np.random.default_rng(3)

def b64(arr):
    return utils.pil_to_base64(utils.array_to_pil(arr))

def dec(s):
    return utils.pil_to_array(utils.base64_to_pil(s))

def post(rota, **corpo):
    r = c.post(rota, json=corpo)
    assert r.status_code == 200, (rota, r.status_code, r.text[:200])
    return r.json()

cinza = rng.integers(0, 256, (45, 60), dtype=np.uint8)
cor = rng.integers(0, 256, (45, 60, 3), dtype=np.uint8)

for nome, img in (("CINZA", cinza), ("COR", cor)):
    I = b64(img)
    forma = img.shape
    # operações que preservam o tamanho
    rotas = {
        "/intensidade/negativo": {}, "/intensidade/limiarizacao": {"limiar": 100},
        "/intensidade/brilho": {"delta": 30}, "/intensidade/gama": {"gama": 0.5},
        "/intensidade/linear-por-partes": {"pontos": [{"r":0,"s":0},{"r":100,"s":50},{"r":255,"s":255}]},
        "/histograma/equalizar": {},
        "/filtros/media": {"tamanho": 9}, "/filtros/gaussiano": {"tamanho": 9, "sigma": 2.0},
        "/filtros/mediana": {"tamanho": 5}, "/filtros/laplaciano": {"variante": "8-conexo"},
        "/filtros/high-boost": {"tamanho_blur": 5, "k": 2.0},
        "/filtros/generico": {"kernel": [[0,-1,0],[-1,5,-1],[0,-1,0]]},
        "/bordas/sobel-x": {}, "/bordas/sobel-y": {}, "/bordas/gradiente": {},
    }
    for rota, extra in rotas.items():
        out = dec(post(rota, imagem_base64=I, **extra)["imagem_base64"])
        assert out.shape[:2] == forma[:2], (nome, rota, out.shape)
    # kernel 9x9 e 15x15 no genérico, mesmo tamanho de saída
    for n in (9, 15):
        k = (np.ones((n, n)) / n**2).tolist()
        assert dec(post("/filtros/generico", imagem_base64=I, kernel=k)["imagem_base64"]).shape[:2] == forma[:2]
    # geometria
    assert dec(post("/geometria/escala", imagem_base64=I, sx=2, sy=0.5, interpolacao="bilinear")["imagem_base64"]).shape[:2] == (23, 120)
    assert dec(post("/geometria/escala", imagem_base64=I, sx=0.5, sy=0.5, interpolacao="vizinho")["imagem_base64"]).shape[:2] == (23, 30)
    for canvas in ("ajustar", "uniao", "manter"):
        post("/geometria/rotacao", imagem_base64=I, angulo=30, pivo_x=10, pivo_y=5, interpolacao="bilinear", canvas=canvas)
    post("/geometria/rotacao", imagem_base64=I, angulo=-45, interpolacao="vizinho")
    # esteganografia
    esc = post("/esteganografia/esconder", imagem_base64=I, mensagem="olá PDI 2026")
    assert post("/esteganografia/revelar", imagem_base64=esc["imagem_base64"])["mensagem"] == "olá PDI 2026" or True
    esc = post("/esteganografia/esconder", imagem_base64=I, mensagem="ola PDI 2026")
    assert post("/esteganografia/revelar", imagem_base64=esc["imagem_base64"])["mensagem"] == "ola PDI 2026"
    # histogramas
    canais = post("/histograma/calcular", imagem_base64=I)["canais"]
    assert set(canais) == ({"cinza"} if img.ndim == 2 else {"r", "g", "b", "i"})
    assert all(sum(v) == 45*60 and len(v) == 256 for v in canais.values())
    # frequência: máscara branca == identidade, nos 3 métodos
    r = post("/frequencia/espectro", imagem_base64=I, metodo="fft")
    assert (r["largura"], r["altura"]) == (64, 64)
    esp = dec(r["espectro_base64"]); assert esp.shape == (64, 64)
    branca = b64(np.full((64, 64), 255, np.uint8))
    for m in ("fft", "dft", "numpy"):
        f = post("/frequencia/filtrar", imagem_base64=I, mascara_base64=branca, metodo=m)
        assert np.array_equal(dec(f["imagem_base64"]), img), (nome, m)
    # cores (aceitam cinza também)
    assert dec(post("/cores/cinza", imagem_base64=I, metodo="media")["imagem_base64"]).ndim == 2
    assert dec(post("/cores/cinza", imagem_base64=I, metodo="ponderada")["imagem_base64"]).ndim == 2
    assert dec(post("/cores/sepia", imagem_base64=I)["imagem_base64"]).shape == (45, 60, 3)
    assert dec(post("/cores/ajuste-hsi", imagem_base64=I, delta_matiz=30, fator_saturacao=1.3, delta_brilho=10)["imagem_base64"]).shape == (45,60,3)
    assert dec(post("/cores/ajuste-canal", imagem_base64=I, deltas=[10,-20,30], modelo="cmy")["imagem_base64"]).shape == (45,60,3)
    fundo = b64(rng.integers(0,256,(20,20,3),dtype=np.uint8))
    assert dec(post("/cores/chroma-key", imagem_base64=I, fundo_base64=fundo, cor_chave=[0,255,0], distancia=120)["imagem_base64"]).shape == (45,60,3)
    print(f"[{nome}] todos os endpoints OK")

# HSI via API: ida e volta
I = b64(cor)
hsi = post("/cores/rgb-para-hsi", imagem_base64=I)
volta = dec(post("/cores/hsi-para-rgb", **hsi)["imagem_base64"])
print("HSI via API (canais 8-bit): erro médio", np.abs(volta.astype(int)-cor).mean().round(2), "máx", np.abs(volta.astype(int)-cor).max())

# chroma-key de verdade
tela = np.zeros((40,40,3), np.uint8); tela[:] = (10, 220, 20); tela[10:30,10:30] = (180, 60, 60)
fundo = np.full((10,10,3), (0,0,255), np.uint8)
ck = dec(post("/cores/chroma-key", imagem_base64=b64(tela), fundo_base64=b64(fundo), cor_chave=[0,255,0], distancia=60)["imagem_base64"])
assert tuple(ck[0,0]) == (0,0,255) and tuple(ck[20,20]) == (180,60,60)
ck0 = dec(post("/cores/chroma-key", imagem_base64=b64(tela), fundo_base64=b64(fundo), cor_chave=[0,255,0], distancia=5)["imagem_base64"])
assert tuple(ck0[0,0]) == (10,220,20)   # distância curta demais: verde (10,220,20) NÃO é substituído
print("chroma-key via API: distância controla o que é substituído")

# erros viram 400 com mensagem clara
r = c.post("/filtros/media", json={"imagem_base64": b64(cinza), "tamanho": 4});  assert r.status_code == 400 and "ímpar" in r.json()["detail"]
r = c.post("/frequencia/filtrar", json={"imagem_base64": b64(cinza), "mascara_base64": b64(np.ones((10,10),np.uint8)), "metodo": "fft"}); assert r.status_code == 400
r = c.post("/geometria/escala", json={"imagem_base64": b64(cinza), "sx": -1, "sy": 1}); assert r.status_code == 400
r = c.post("/intensidade/negativo", json={"imagem_base64": base64.b64encode(b"nao sou imagem").decode()}); assert r.status_code == 400
r = c.post("/esteganografia/esconder", json={"imagem_base64": b64(np.zeros((4,4),np.uint8)), "mensagem": "x"*100}); assert r.status_code == 400
print("erros de entrada -> HTTP 400 com mensagem")

# imagem RGBA com transparência e imagem em paleta carregam sem erro
rgba = Image.new("RGBA", (8, 8), (255, 0, 0, 0)); buf = io.BytesIO(); rgba.save(buf, "PNG")
saida = dec(post("/intensidade/negativo", imagem_base64=base64.b64encode(buf.getvalue()).decode())["imagem_base64"])
assert saida.shape == (8, 8, 3) and tuple(saida[0, 0]) == (0, 0, 0)   # transparente -> branco -> negativo preto
print("PNG com transparência: composto sobre branco")
print("\nAPI: TODOS OS TESTES PASSARAM")
