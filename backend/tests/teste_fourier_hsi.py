"""Testes de Fourier (DFT/FFT próprias) e HSI. Rodar: PYTHONPATH=. python3 tests/teste_fourier_hsi.py"""
import time
import numpy as np
import fourier, color

rng = np.random.default_rng(1)

# HSI: ida e volta em 140 mil cores 8-bit
g = np.arange(0, 256, 5, dtype=np.uint8)
R, G, B = np.meshgrid(g, g, g, indexing="ij")
cores = np.stack([R, G, B], axis=-1).reshape(-1, 1, 3)
volta = color.hsi_para_rgb(color.rgb_para_hsi(cores))
assert np.abs(volta.astype(int) - cores.astype(int)).max() <= 1
h = color.rgb_para_hsi(np.array([[[255,0,0],[0,255,0],[0,0,255],[128,128,128],[255,255,0]]], dtype=np.uint8))
assert np.allclose(h[0,:3,0],[0,120,240]) and np.isclose(h[0,3,1],0) and np.isclose(h[0,4,0],60)
print("HSI: ida e volta exata; valores conhecidos (R=0°, G=120°, B=240°, amarelo=60°) OK")

# FFT própria == DFT própria == numpy
for shape in [(8,8),(64,32),(128,128)]:
    f = rng.random(shape); ref = np.fft.fft2(f)
    assert np.allclose(fourier.fft_2d(f), ref) and np.allclose(fourier.dft_2d_ingenua(f), ref)
    for m in ("fft","dft"):
        assert np.allclose(np.real(fourier.inversa_2d(ref, m)), f)
print("FFT própria == DFT própria == numpy.fft2; inversas OK")

# máscara branca = identidade (tamanho não potência de 2, cinza e cor)
for arr in [rng.integers(0,256,(50,70),dtype=np.uint8), rng.integers(0,256,(50,70,3),dtype=np.uint8)]:
    ph, pw = fourier.tamanho_do_espectro(*arr.shape[:2])
    for m in ("fft","dft","numpy"):
        out,_ = fourier.filtrar(arr, np.ones((ph,pw)), m)
        assert np.array_equal(out, arr)
print("máscara toda branca devolve a imagem original")

# passa-baixa reduz variação
img = rng.integers(0,256,(64,64),dtype=np.uint8)
yy,xx = np.mgrid[:64,:64]
low,_ = fourier.filtrar(img, (np.hypot(yy-32,xx-32)<=8).astype(float), "fft")
assert low.std() < img.std()
print("passa-baixa reduz o desvio padrão:", round(img.std(),1), "->", round(low.std(),1))

# desempenho
big = rng.random((1024,1024))
t=time.perf_counter(); fourier.fft_2d(big); t1=time.perf_counter()-t
t=time.perf_counter(); fourier.dft_2d_ingenua(big); t2=time.perf_counter()-t
print(f"1024x1024: FFT própria {t1*1000:.0f} ms | DFT ingênua {t2*1000:.0f} ms")
print("OK")
