import { test } from "node:test";
import assert from "node:assert/strict";
import * as H from "../src/hooks/historico.js";

const img = (n) => ({ base64: `img${n}`, mime: "image/png" });
const nomes = (e) => e.estados.map((x) => x.base64);

function comEdicoes(limite, quantas) {
  let e = H.carregar(H.criar(limite), img(0));
  for (let i = 1; i <= quantas; i++) e = H.aplicar(e, img(i), `edição ${i}`);
  return e;
}

test("carregar cria o estado inicial e guarda o original", () => {
  const e = H.carregar(H.criar(), img(0));
  assert.equal(H.atual(e).base64, "img0");
  assert.equal(H.podeDesfazer(e), false);
  assert.equal(H.temEdicoes(e), false);
});

test("aplicar acumula edições e desfazer/refazer navegam", () => {
  let e = comEdicoes(20, 3);
  assert.equal(H.atual(e).base64, "img3");
  e = H.desfazer(e); e = H.desfazer(e);
  assert.equal(H.atual(e).base64, "img1");
  assert.equal(H.podeRefazer(e), true);
  e = H.refazer(e);
  assert.equal(H.atual(e).base64, "img2");
});

test("desfazer e refazer nos extremos não fazem nada", () => {
  let e = comEdicoes(20, 2);
  e = H.refazer(e);
  assert.equal(e.indice, 2);
  e = H.desfazer(H.desfazer(H.desfazer(H.desfazer(e))));
  assert.equal(e.indice, 0);
});

test("nova edição depois de desfazer descarta o 'refazer'", () => {
  let e = comEdicoes(20, 3);
  e = H.desfazer(H.desfazer(e)); // em img1
  e = H.aplicar(e, img(99), "nova");
  assert.deepEqual(nomes(e), ["img0", "img1", "img99"]);
  assert.equal(H.podeRefazer(e), false);
});

test("limite: guarda só as últimas N mudanças (dá para desfazer N vezes)", () => {
  let e = comEdicoes(5, 12);
  assert.equal(e.estados.length, 6);
  assert.deepEqual(nomes(e), ["img7", "img8", "img9", "img10", "img11", "img12"]);
  let n = 0;
  while (H.podeDesfazer(e)) { e = H.desfazer(e); n++; }
  assert.equal(n, 5);
  assert.equal(H.atual(e).base64, "img7");
});

test("reduzir o limite descarta os mais antigos e mantém a imagem atual", () => {
  let e = comEdicoes(20, 10);
  e = H.definirLimite(e, 3);
  assert.deepEqual(nomes(e), ["img7", "img8", "img9", "img10"]);
  assert.equal(H.atual(e).base64, "img10");
});

test("reduzir o limite no meio do histórico preserva o atual e corta o refazer mais distante", () => {
  let e = comEdicoes(20, 10);
  for (let i = 0; i < 6; i++) e = H.desfazer(e); // atual = img4
  e = H.definirLimite(e, 3);
  assert.equal(H.atual(e).base64, "img4");
  assert.ok(e.estados.length <= 4);
});

test("aumentar o limite não perde nada", () => {
  let e = comEdicoes(3, 5);
  e = H.definirLimite(e, 50);
  e = H.aplicar(e, img(6), "x");
  assert.equal(e.estados.length, 5);
});

test("limite é validado (1 a 100)", () => {
  assert.equal(H.limiteValido(0), 1);
  assert.equal(H.limiteValido(1000), 100);
  assert.equal(H.limiteValido("abc"), 20);
  assert.equal(H.limiteValido(7.6), 8);
});

test("reverterOriginal é uma edição desfazível e não repete se já é o original", () => {
  let e = comEdicoes(20, 3);
  e = H.reverterOriginal(e);
  assert.equal(H.atual(e).base64, "img0");
  assert.equal(e.estados.length, 5);
  e = H.desfazer(e);
  assert.equal(H.atual(e).base64, "img3");
  e = H.carregar(H.criar(), img(0));
  assert.equal(H.reverterOriginal(e).estados.length, 1);
});

test("reverterOriginal ainda funciona depois que o estado inicial saiu do limite", () => {
  let e = comEdicoes(2, 8);
  assert.ok(!nomes(e).includes("img0"));
  e = H.reverterOriginal(e);
  assert.equal(H.atual(e).base64, "img0");
});

test("irPara salta para um passo e ignora índices inválidos", () => {
  let e = comEdicoes(20, 4);
  e = H.irPara(e, 1);
  assert.equal(H.atual(e).base64, "img1");
  assert.equal(H.irPara(e, 99).indice, 1);
});

test("novo carregamento reinicia o histórico mas mantém o limite", () => {
  let e = comEdicoes(7, 4);
  e = H.carregar(e, img(50));
  assert.deepEqual(nomes(e), ["img50"]);
  assert.equal(e.limite, 7);
});

test("aplicar antes de existir imagem é ignorado", () => {
  const e = H.aplicar(H.criar(), img(1), "x");
  assert.equal(e.estados.length, 0);
});
