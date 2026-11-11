import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { SliderNumerico } from "../src/components/ui.jsx";

function Exemplo(props) {
  const [v, setV] = useState(props.inicial ?? 10);
  return (
    <>
      <SliderNumerico label="Valor" valor={v} onChange={setV} min={0} max={100} {...props} />
      <output data-testid="estado">{v}</output>
    </>
  );
}
const campo = () => screen.getByLabelText("Valor (valor)");
const slider = () => screen.getByLabelText("Valor");
const estado = () => screen.getByTestId("estado").textContent;

test("mostra o valor inicial no campo e no slider", () => {
  render(<Exemplo />);
  expect(campo().value).toBe("10");
  expect(slider().value).toBe("10");
});

test("arrastar o slider atualiza o campo", () => {
  render(<Exemplo />);
  fireEvent.change(slider(), { target: { value: "42" } });
  expect(campo().value).toBe("42");
  expect(estado()).toBe("42");
});

test("digitar no campo atualiza o valor e o slider (ajuste fino)", () => {
  render(<Exemplo />);
  fireEvent.focus(campo());
  fireEvent.change(campo(), { target: { value: "37" } });
  expect(estado()).toBe("37");
  expect(slider().value).toBe("37");
});

test("durante a digitação, texto incompleto não quebra o campo", () => {
  render(<Exemplo />);
  fireEvent.focus(campo());
  fireEvent.change(campo(), { target: { value: "" } });
  expect(campo().value).toBe("");
  expect(estado()).toBe("10");               // valor anterior preservado
  fireEvent.blur(campo());
  expect(campo().value).toBe("10");          // campo vazio volta ao valor válido
});

test("fora do intervalo: ao sair do campo, o valor é limitado", () => {
  render(<Exemplo />);
  fireEvent.focus(campo());
  fireEvent.change(campo(), { target: { value: "500" } });
  expect(estado()).toBe("10");               // ainda não propagou valor inválido
  fireEvent.blur(campo());
  expect(estado()).toBe("100");
  expect(campo().value).toBe("100");
});

test("texto inválido volta ao valor anterior", () => {
  render(<Exemplo />);
  fireEvent.focus(campo());
  fireEvent.change(campo(), { target: { value: "abc" } });
  fireEvent.blur(campo());
  expect(campo().value).toBe("10");
});

test("limiteMax permite digitar além do alcance do slider", () => {
  render(<Exemplo limiteMax={600} />);
  fireEvent.focus(campo());
  fireEvent.change(campo(), { target: { value: "250" } });
  expect(estado()).toBe("250");
  expect(slider().value).toBe("100");        // slider só fica no extremo
});

test("setas ↑/↓ somam o passo; Shift multiplica por 10", () => {
  render(<Exemplo />);
  fireEvent.keyDown(campo(), { key: "ArrowUp" });
  expect(estado()).toBe("11");
  fireEvent.keyDown(campo(), { key: "ArrowDown" });
  fireEvent.keyDown(campo(), { key: "ArrowDown" });
  expect(estado()).toBe("9");
  fireEvent.keyDown(campo(), { key: "ArrowUp", shiftKey: true });
  expect(estado()).toBe("19");
});

test("passo decimal: mostra casas e aceita vírgula", () => {
  render(<Exemplo inicial={1} step={0.05} />);
  expect(campo().value).toBe("1.00");
  fireEvent.focus(campo());
  fireEvent.change(campo(), { target: { value: "2,35" } });
  expect(estado()).toBe("2.35");
});

test("valor alterado de fora (ex.: desfazer) atualiza o campo", () => {
  const { rerender } = render(<SliderNumerico label="Valor" valor={5} onChange={() => {}} min={0} max={100} />);
  rerender(<SliderNumerico label="Valor" valor={77} onChange={() => {}} min={0} max={100} />);
  expect(campo().value).toBe("77");
});
