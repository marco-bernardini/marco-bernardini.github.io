import { clamp, fromPercent, toPercent } from './balance.js';

export function createControls(root, onHeight, options = {}) {
  const decode = options.fromPercent || fromPercent;
  const encode = options.toPercent || toPercent;
  const slider = root.querySelector('#boat-height');
  const raise = root.querySelector('#boat-raise');
  const lower = root.querySelector('#boat-lower');
  const canvas = root.querySelector('#boat-canvas');
  const keys = new Set();
  let enabled = false;
  let percent = 50;
  let pointerDown = false, lastRangeInput = 0;
  const signal = (direction, seconds) => { if (enabled && direction && seconds > 0) options.onInput?.(direction, seconds); };
  const change = value => {
    if (!enabled) return;
    percent = clamp(value, 0, 100);
    slider.value = String(percent);
    onHeight(decode(percent));
  };
  slider.addEventListener('pointerdown', () => { pointerDown = true; lastRangeInput = performance.now(); });
  window.addEventListener('pointerup', () => { pointerDown = false; });
  window.addEventListener('pointercancel', () => { pointerDown = false; });
  slider.addEventListener('input', () => {
    const value = Number(slider.value), direction = Math.sign(value - percent), now = performance.now();
    const seconds = pointerDown ? clamp((now - lastRangeInput) / 1000, 0.001, 0.15) : 0.12;
    change(value); signal(direction, seconds); lastRangeInput = now;
  });
  raise.addEventListener('click', () => { change(percent + 0.75); signal(1, 0.12); });
  lower.addEventListener('click', () => { change(percent - 0.75); signal(-1, 0.12); });
  root.addEventListener('keydown', event => {
    if (!enabled || ![slider, canvas, raise, lower].includes(event.target) || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    if (!keys.has(event.key)) { const direction = event.key === 'ArrowUp' ? 1 : -1; change(percent + direction * 0.75); signal(direction, 1 / 60); }
    keys.add(event.key);
  });
  root.addEventListener('keyup', event => keys.delete(event.key));
  root.addEventListener('focusout', () => keys.clear());
  window.addEventListener('blur', () => { keys.clear(); pointerDown = false; });
  document.addEventListener('visibilitychange', () => { keys.clear(); pointerDown = false; });
  return {
    tick(dt) {
      const direction = Number(keys.has('ArrowUp')) - Number(keys.has('ArrowDown'));
      if (direction) { change(percent + direction * (options.speed || 24) * dt); signal(direction, dt); }
    },
    sync(height) { percent = encode(height); slider.value = String(percent); },
    enable(value) { enabled = value; keys.clear(); slider.disabled = raise.disabled = lower.disabled = !value; },
    describe(text) { slider.setAttribute('aria-valuetext', text); },
  };
}
