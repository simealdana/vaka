import { describe, expect, it } from 'vitest';
import type { ParamPath } from '../types';
import { type SensitivityVariable, sortBySwing, tornadoBars } from './sensitivity';

const VARIABLES: SensitivityVariable[] = [
  { path: 'precio', label: 'Precio de la leche', base: 0.62, low: 0.38, high: 0.82 },
  { path: 'litros', label: 'Litros por vaca', base: 8, low: 6, high: 10 },
  { path: 'mortalidad', label: 'Mortalidad de becerras', base: 0.06, low: 0.04, high: 0.16 },
];

/** Patrimonio de juguete: lineal en cada variable, así el quiebre es calculable a mano. */
const evaluate = (path: ParamPath, value: number): number | null => {
  const at = { precio: 0.62, litros: 8, mortalidad: 0.06, [path]: value };
  return 200000 * (at.precio - 0.5) + 20000 * (at.litros - 8) - 300000 * (at.mortalidad - 0.06);
};

const baseMetric = evaluate('precio', 0.62);

describe('tornadoBars', () => {
  it('devuelve una barra por variable con ambos extremos evaluados', () => {
    const bars = tornadoBars({ variables: VARIABLES, evaluate, baseMetric, threshold: 0 });
    expect(bars).toHaveLength(3);
    for (const bar of bars) {
      expect(bar.lowMetric).not.toBeNull();
      expect(bar.highMetric).not.toBeNull();
      expect(bar.swing).toBeGreaterThan(0);
    }
  });

  it('ordena por amplitud: el precio manda sobre los litros', () => {
    const bars = sortBySwing(tornadoBars({ variables: VARIABLES, evaluate, baseMetric, threshold: 0 }));
    expect(bars[0].label).toBe('Precio de la leche');
    expect(bars[0].swing).toBeGreaterThan(bars[1].swing);
  });

  it('encuentra el punto de quiebre del lado que cruza', () => {
    const bars = tornadoBars({ variables: VARIABLES, evaluate, baseMetric, threshold: 0 });
    const precio = bars.find((b) => b.path === 'precio');
    // 200000*(p-0.5) = 0  =>  p = 0.5, alcanzable bajando desde 0.62.
    expect(precio?.breakpoint?.side).toBe('low');
    expect(precio?.breakpoint?.value).toBeCloseTo(0.5, 2);

    const litros = bars.find((b) => b.path === 'litros');
    // 24000 + 20000*(L-8) = 0  =>  L = 6.8, bajando desde 8.
    expect(litros?.breakpoint?.side).toBe('low');
    expect(litros?.breakpoint?.value).toBeCloseTo(6.8, 2);
  });

  it('no hay punto de quiebre si la finca aguanta todo el rango', () => {
    const bars = tornadoBars({
      variables: VARIABLES,
      evaluate,
      baseMetric,
      threshold: -1_000_000,
    });
    for (const bar of bars) expect(bar.breakpoint).toBeNull();
  });

  it('detecta el quiebre hacia arriba en una variable que hace daño al subir', () => {
    const bars = tornadoBars({
      variables: VARIABLES,
      evaluate,
      baseMetric,
      threshold: 20000,
    });
    const mortalidad = bars.find((b) => b.path === 'mortalidad');
    // 24000 - 300000*(m-0.06) = 20000  =>  m ≈ 0.0733, subiendo desde 0.06.
    expect(mortalidad?.breakpoint?.side).toBe('high');
    expect(mortalidad?.breakpoint?.value).toBeCloseTo(0.0733, 3);
  });

  it('el tramo [from, to) permite repartir el barrido entre workers', () => {
    const all = tornadoBars({ variables: VARIABLES, evaluate, baseMetric, threshold: 0 });
    const first = tornadoBars({ variables: VARIABLES, evaluate, baseMetric, threshold: 0 }, 0, 1);
    const rest = tornadoBars({ variables: VARIABLES, evaluate, baseMetric, threshold: 0 }, 1, 3);
    expect([...first, ...rest]).toEqual(all);
  });

  it('reporta el progreso una vez por variable', () => {
    const seen: number[] = [];
    tornadoBars({ variables: VARIABLES, evaluate, baseMetric, threshold: 0 }, 0, 3, (done) =>
      seen.push(done),
    );
    expect(seen).toEqual([1, 2, 3]);
  });

  it('no bisecta cuando la métrica base no existe', () => {
    let calls = 0;
    const bars = tornadoBars({
      variables: [VARIABLES[0]],
      evaluate: (p, v) => {
        calls++;
        return evaluate(p, v);
      },
      baseMetric: null,
      threshold: 0,
    });
    expect(bars[0].breakpoint).toBeNull();
    expect(calls).toBe(2);
  });
});
