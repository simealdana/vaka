import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSUMPTIONS } from '../../../engine/defaults';
import { getByPath } from '../../../engine/scenario/resolve';
import { simulate } from '../../../engine/simulate';
import { EVENT_PRESETS, type OverrideDraft, STRESS_PRESETS, instantiate } from './stress';

const baseline = simulate(DEFAULT_ASSUMPTIONS);

const run = (preset: { overrides: OverrideDraft[] }) =>
  simulate(DEFAULT_ASSUMPTIONS, preset.overrides.map(instantiate));

const ALL = [...EVENT_PRESETS, ...STRESS_PRESETS];

describe('presets de eventos y pruebas de estrés', () => {
  it('todos apuntan a una ruta numérica que existe en los supuestos', () => {
    for (const preset of ALL) {
      for (const o of preset.overrides) {
        const value = getByPath(DEFAULT_ASSUMPTIONS, o.target);
        expect(typeof value, `${preset.id} → ${o.target}`).toBe('number');
      }
    }
  });

  it('ningún identificador se repite entre las dos listas', () => {
    const ids = ALL.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('todos mueven el resultado: un preset que no cambia nada es un botón muerto', () => {
    for (const preset of ALL) {
      const equity = run(preset).summary.finalBookEquity;
      expect(equity, preset.id).not.toBeCloseTo(baseline.summary.finalBookEquity, 2);
    }
  });

  it('el signo del efecto de cada evento coincide con el tono declarado', () => {
    for (const preset of EVENT_PRESETS) {
      const equity = run(preset).summary.finalBookEquity;
      if (preset.tone === 'malo') {
        expect(equity, preset.id).toBeLessThan(baseline.summary.finalBookEquity);
      } else {
        expect(equity, preset.id).toBeGreaterThan(baseline.summary.finalBookEquity);
      }
    }
  });

  it('las ocho pruebas de estrés del documento empeoran la finca, ninguna la mejora', () => {
    expect(STRESS_PRESETS).toHaveLength(8);
    for (const preset of STRESS_PRESETS) {
      expect(run(preset).summary.finalBookEquity, preset.id).toBeLessThan(
        baseline.summary.finalBookEquity,
      );
    }
  });

  it('los eventos con ventana cerrada dejan de pesar cuando pasan', () => {
    const sequia = EVENT_PRESETS.find((p) => p.id === 'evento-sequia');
    if (!sequia) throw new Error('falta el preset de sequía severa');
    const output = run(sequia);
    // Mes 5: antes de que empiece (arranca en el 12). Mes 110: mucho después de la recuperación.
    expect(output.months[5].feed.dmPastureKg).toBeCloseTo(baseline.months[5].feed.dmPastureKg, 6);
    expect(output.months[110].feed.dmPastureKg).toBeCloseTo(baseline.months[110].feed.dmPastureKg, 6);
  });
});
