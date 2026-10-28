import { ChallengeDeck, MODEL, advance, toDegrees, stillSliderHeight, stillSliderPercent } from './balance.js';
import { createControls } from './controls.js';
import { createScene } from './scene.js';

export function startGame(root, onFailure) {
  const $ = selector => root.querySelector(selector);
  const deck = new ChallengeDeck();
  let state, round = 0, completed = 0, lastTime = null, frame, stopped = false, lastDescription = '';
  const controls = createControls(root, height => { if (!state.won) state.height = height; }, {
    fromPercent: percent => stillSliderHeight(state.initialHeight, percent),
    toPercent: height => stillSliderPercent(state.initialHeight, height),
  });
  const scene = createScene($('#boat-canvas'), $('#boat-viewport'), () => { stopped = true; controls.enable(false); cancelAnimationFrame(frame); onFailure(); });
  const sideName = side => side === 'bow' ? 'Bowside' : 'Strokeside';
  function nextRound() {
    state = deck.next(); round++;
    controls.sync(state.height); controls.enable(true);
    $('#boat-success').hidden = true;
    $('#boat-round').textContent = String(round).padStart(2, '0');
    $('#boat-challenge').textContent = `${sideName(state.side)} rower. Bowside starts ${state.position}.`;
    $('#boat-rig').textContent = `You’re rowing ${sideName(state.side).toLowerCase()}.`;
    $('#boat-announcement').textContent = `Challenge ${round}. You are rowing ${sideName(state.side).toLowerCase()}. Bowside starts ${state.position}. Adjust the handle to level the boat.`;
    root.dataset.state = 'playing';
    lastTime = null;
    renderStatus();
  }
  function renderStatus() {
    const angle = Math.abs(toDegrees(state.lean));
    const level = angle <= 1;
    const description = level ? 'Level — let it settle' : `Bowside ${angle.toFixed(1)}° ${state.lean > 0 ? 'high' : 'low'}`;
    if (description !== lastDescription) { $('#boat-angle').textContent = state.won ? 'Level — balanced!' : description; lastDescription = description; }
    $('#boat-needle').style.left = `${50 + state.lean / MODEL.maxLean * 46}%`;
    $('#boat-hold-progress').value = state.hold;
    $('#boat-hold-label').textContent = state.won ? 'Nicely done. Ready for the next one?' : state.hold > 0 ? 'That’s it. Hold steady…' : 'Bring the boat level, then hold for a moment.';
    root.classList.toggle('boat-is-level', level);
    controls.describe(`${Math.round(stillSliderPercent(state.initialHeight, state.height))}% of handle range. ${state.won ? 'Boat balanced.' : description}`);
  }
  function win() {
    state.won = true; completed++;
    controls.enable(false);
    const raised = (state.side === 'bow') === (state.position === 'low');
    const explanation = `${raised ? 'Raising' : 'Lowering'} your ${sideName(state.side).toLowerCase()} handle ${raised ? 'lifted' : 'lowered'} that side and brought the boat level.`;
    $('#boat-explanation').textContent = explanation;
    $('#boat-success').hidden = false;
    $('#boat-completed').textContent = `${completed} challenge${completed === 1 ? '' : 's'} balanced`;
    $('#boat-announcement').textContent = `Balanced! ${explanation} Choose Next challenge to continue.`;
    root.dataset.state = 'success';
    lastDescription = '';
  }
  function animate(time) {
    if (stopped) return;
    const dt = lastTime === null ? 0 : Math.min((time - lastTime) / 1000, 0.05);
    lastTime = time;
    if (!state.won && !document.hidden) {
      controls.tick(dt);
      if (advance(state, dt)) win();
    }
    scene.update(state);
    renderStatus();
    frame = requestAnimationFrame(animate);
  }
  $('#boat-next').addEventListener('click', () => { nextRound(); $('#boat-height').focus({ preventScroll: true }); });
  document.addEventListener('visibilitychange', () => { lastTime = null; if (!state.won) state.hold = 0; });
  window.addEventListener('pagehide', event => {
    cancelAnimationFrame(frame);
    lastTime = null;
    if (!event.persisted) { stopped = true; scene.dispose(); }
  });
  window.addEventListener('pageshow', event => { if (event.persisted && !stopped) { lastTime = null; frame = requestAnimationFrame(animate); } });
  nextRound();
  $('#boat-load-message').hidden = true;
  frame = requestAnimationFrame(animate);
}
