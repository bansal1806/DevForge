/**
 * Verifies WCAG contrast for the design tokens in both themes.
 * Usage: node scripts/check-contrast.mjs   (exits 1 on any failure)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(here, '..', 'src', 'styles', 'tokens.css'), 'utf8');

function block(selector) {
  const start = css.indexOf(selector);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  const vars = {};
  for (const m of css.slice(open + 1, close).matchAll(/(--[\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}

const shared = block(':root {');
const themes = { dark: block("[data-theme='dark'] {"), light: block("[data-theme='light'] {") };

function parse(color) {
  let m = color.match(/^#([0-9a-f]{6})$/i);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 };
  m = color.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const [r, g, b, a = '1'] = m[1].split(',').map((s) => s.trim());
    return { r: +r, g: +g, b: +b, a: +a };
  }
  throw new Error(`Unsupported color: ${color}`);
}

const blend = (fg, bg) => ({
  r: fg.r * fg.a + bg.r * (1 - fg.a),
  g: fg.g * fg.a + bg.g * (1 - fg.a),
  b: fg.b * fg.a + bg.b * (1 - fg.a),
  a: 1,
});

function luminance({ r, g, b }) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(fg, bg) {
  const [l1, l2] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

// [foreground, background(s), minimum, note]
const TEXT = 4.5;
const UI = 3;
const checks = [
  ['--color-text', ['--color-bg', '--color-surface', '--color-surface-2', '--color-surface-3'], TEXT],
  ['--color-text-secondary', ['--color-bg', '--color-surface', '--color-surface-2'], TEXT],
  ['--color-text-muted', ['--color-bg', '--color-surface', '--color-surface-2'], TEXT],
  ['--color-ember-text', ['--color-bg', '--color-surface', '--color-surface-2'], TEXT],
  ['--color-success', ['--color-surface', '--color-success-soft'], TEXT],
  ['--color-danger', ['--color-surface', '--color-danger-soft'], TEXT],
  ['--color-warning', ['--color-surface', '--color-warning-soft'], TEXT],
  ['--color-info', ['--color-surface', '--color-info-soft'], TEXT],
  ['--color-ember-text', ['--color-ember-soft'], TEXT],
  ['--color-steel', ['--color-surface', '--color-steel-soft'], TEXT],
  ['--color-bg', ['--color-success', '--color-steel', '--color-violet'], TEXT, 'state pills'],
  ['--color-focus', ['--color-bg', '--color-surface'], UI],
  ['--color-border-strong', ['--color-surface'], 1.4, 'decorative divider'],
];

let failures = 0;
for (const [name, vars] of Object.entries(themes)) {
  console.log(`\n${name.toUpperCase()}`);
  const surface = parse(vars['--color-surface']);
  const resolve = (token) => {
    const c = parse(vars[token] ?? shared[token]);
    return c.a < 1 ? blend(c, surface) : c; // translucent tokens sit on a surface
  };

  for (const [fg, bgs, min, note] of checks) {
    for (const bg of bgs) {
      const r = ratio(resolve(fg), resolve(bg));
      const ok = r >= min;
      if (!ok) failures++;
      console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${fg} on ${bg}: ${r.toFixed(2)} (min ${min}${note ? `, ${note}` : ''})`);
    }
  }

  // Dark text on every molten gradient stop (primary buttons)
  for (const stop of ['#ff4d1f', '#ff7a2f', '#ffb347']) {
    const r = ratio(parse(shared['--on-molten']), parse(stop));
    const ok = r >= TEXT;
    if (!ok) failures++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} --on-molten on molten ${stop}: ${r.toFixed(2)} (min ${TEXT})`);
  }
}

console.log(failures ? `\n${failures} contrast failure(s)` : '\nAll contrast checks pass');
process.exit(failures ? 1 : 0);
