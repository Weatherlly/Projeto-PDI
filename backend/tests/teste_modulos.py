import numpy as np
import geometry, edges, filters, convolution, histogram, intensity, steganography, color

rng = np.random.default_rng(1)
im = rng.integers(0,256,(30,40),dtype=np.uint8)
imc = rng.integers(0,256,(30,40,3),dtype=np.uint8)

for ang in (0,360):
    for interp in ("vizinho","bilinear"):
        assert np.array_equal(geometry.rotacao(im, ang, None, interp, "ajustar"), im), (ang, interp)
print("rotação 0° e 360° = identidade")
r90 = geometry.rotacao(im, 90, None, "vizinho","ajustar")
assert np.array_equal(r90, np.rot90(im,1)) and np.array_equal(geometry.rotacao(im,180,None,"vizinho","ajustar"), np.rot90(im,2)) and np.array_equal(geometry.rotacao(im,270,None,"vizinho","ajustar"), np.rot90(im,3))
print("rotação 90°/180°/270° coincidem exatamente com np.rot90 (anti-horário):", im.shape, "->", r90.shape)
print("45° ajustar:", geometry.rotacao(imc,45).shape, "| uniao:", geometry.rotacao(imc,45,(0,0),"bilinear","uniao").shape, "| manter:", geometry.rotacao(imc,45,(0,0),"bilinear","manter").shape)
marc = np.zeros((51,51),dtype=np.uint8); marc[10,20]=255
assert geometry.rotacao(marc, 37, (20,10), "vizinho","manter")[10,20]==255
print("pivô (20,10) permanece fixo em 'manter'")

borda = np.zeros((20,20),dtype=np.uint8); borda[:,10:]=200
gx,gy = edges.sobel_bruto(borda)
assert np.abs(gx).max()>0 and np.abs(gy[2:-2,2:-2]).max()==0
for f in (edges.sobel_x, edges.sobel_y, edges.magnitude_gradiente):
    for a in (im, imc):
        o=f(a); assert o.shape==a.shape and o.dtype==np.uint8
print("sobel x/y e gradiente OK (cinza e cor); borda vertical: |gx| máx", np.abs(gx).max(), ", gy interior 0")

for fn in (lambda a: filters.filtro_media(a,9), lambda a: filters.filtro_gaussiano(a,5), lambda a: filters.filtro_mediana(a,5),
           filters.aguçamento_laplaciano, lambda a: filters.aguçamento_high_boost(a,5,1.5)):
    o=fn(imc); assert o.shape==imc.shape and o.dtype==np.uint8
a = im[:12,:12]; ref = np.zeros_like(a); p=np.pad(a,1,mode="edge")
for i in range(12):
    for j in range(12): ref[i,j]=np.median(p[i:i+3,j:j+3])
assert np.array_equal(filters.filtro_mediana(a,3), ref)
k=filters.kernel_media(3)
assert np.allclose(convolution.convoluir(imc[:10,:10],k), convolution.convoluir_vetorizado(imc[:10,:10],k))
print("filtros em cor OK; mediana vetorizada == por laço; laço == vetorizado (3D)")

for fn in (intensity.negativo, lambda a: intensity.limiarizacao(a,100), lambda a: intensity.ajuste_brilho(a,40), lambda a: intensity.correcao_gama(a,0.5),
           lambda a: intensity.transformacao_linear_por_partes(a,[(0,0),(100,50),(255,255)])):
    assert fn(imc).shape==imc.shape
assert steganography.revelar_mensagem(steganography.esconder_mensagem(imc, "teste cor")) == "teste cor"
print("intensidade e esteganografia funcionam em RGB")

h = histogram.histogramas_cor(imc)
assert all(v.sum()==30*40 for v in h.values()); print("histogramas:", list(h))
assert color.escala_de_cinza(imc,"media").ndim==2
assert color.equalizar_histograma_hsi(imc).shape==imc.shape
adj = color.ajuste_hsi(imc,0,1.0,0); assert np.abs(adj.astype(int)-imc).max()<=1
vermelho = np.full((4,4,3),(255,0,0),dtype=np.uint8)
v120=color.ajuste_hsi(vermelho,120)[0,0]; print("matiz +120° em vermelho ->",v120); assert np.abs(v120.astype(int)-[0,255,0]).max()<=1
print("saturação 0 em vermelho ->", color.ajuste_hsi(vermelho,0,0.0)[0,0])
print("canal CMY +50 em cinza 100 ->", color.ajuste_canais(np.full((1,1,3),100,np.uint8),(50,0,0),"cmy")[0,0])
print("sépia em branco ->", color.sepia(np.full((1,1,3),255,np.uint8))[0,0])
verde = np.zeros((10,10,3),np.uint8); verde[:]=(0,255,0); verde[4:6,4:6]=(200,30,30)
fundo = np.full((7,13,3),(10,20,200),np.uint8)
ck = color.chroma_key(verde, fundo, (0,255,0), 80)
assert tuple(ck[0,0])==(10,20,200) and tuple(ck[4,4])==(200,30,30)
print("chroma-key OK (fundo de outro tamanho, objeto preservado)")
print("\nTODOS OS TESTES PASSARAM")
