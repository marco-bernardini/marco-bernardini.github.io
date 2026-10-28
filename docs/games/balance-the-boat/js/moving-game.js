import { toDegrees } from './balance.js';
import { createScene } from './scene.js';
import { createControls } from './controls.js';
import { MOVING, trimFromPercent, trimToPercent } from './moving-balance.js';
import { MovingRun } from './moving-run.js';

const phaseNames = { catch: 'CATCH', drive: 'DRIVE', release: 'RELEASE', recovery: 'RECOVERY' };

export function startGame(root, onFailure) {
  const $ = selector => root.querySelector(selector);
  let run, started = false, stopped = false, frame, previousTime = null, uiTime = 0, lastPhase = '', lastStroke = -1;
  const controls = createControls(root, correction => run.setCorrection(correction), {
    fromPercent: trimFromPercent, toPercent: trimToPercent, speed: MOVING.keyboardPercentSpeed,
    onInput: (direction, seconds) => run.recordInput(direction, seconds),
  });
  const scene = createScene($('#boat-canvas'), $('#boat-viewport'), () => {
    stopped = true; controls.enable(false);
    for (const id of ['#moving-toggle', '#moving-restart', '#moving-mode', '#moving-rate']) $(id).disabled = true;
    cancelAnimationFrame(frame); onFailure();
  }, { moving: true });
  const announce = text => { $('#boat-announcement').textContent = text; };
  const sideName = () => run.side === 'bow' ? 'bowside' : 'strokeside';

  function prepare() {
    if (stopped) return;
    run = new MovingRun({ mode: $('#moving-mode').value, rate: Number($('#moving-rate').value) });
    started = false; lastPhase = ''; lastStroke = -1; previousTime = null;
    controls.sync(0); controls.enable(false);
    $('#moving-summary').hidden = true; $('#moving-pause-label').hidden = true;
    $('#moving-toggle').disabled = false; $('#moving-toggle').textContent = 'Start rowing →';
    $('#moving-restart').disabled = false;
    $('#boat-rig').textContent = `You’re rowing ${sideName()}.`;
    $('#moving-control-hint').textContent = run.mode === 'drive' ? 'Control blade depth on the drive. Recovery runs automatically.' : run.mode === 'recovery' ? 'Balance the boat on the recovery. The drive runs automatically.' : 'Correct handle height through the drive and recovery.';
    root.dataset.state = 'ready';
    announce(`${$('#moving-mode').selectedOptions[0].textContent}. You are rowing ${sideName()}. Press Start rowing to begin.`);
    renderStatus();
  }

  function pause(automatic = false) {
    if (!run.running) return;
    run.pause(); controls.enable(false); previousTime = null;
    root.dataset.state = 'paused'; $('#moving-toggle').textContent = 'Resume →';
    $('#moving-pause-label').hidden = false;
    announce(automatic ? 'Run paused while you were away. Press Resume to continue.' : 'Paused. Press Resume to continue.');
    renderStatus();
  }

  function toggle() {
    if (run.finished || stopped) return;
    if (run.running) return pause();
    const resuming = started;
    started = true; run.start(); controls.enable(true); previousTime = null;
    $('#moving-pause-label').hidden = true; $('#moving-toggle').textContent = 'Pause';
    root.dataset.state = 'playing'; announce(resuming ? `Resumed, rowing ${sideName()}.` : `Rowing ${sideName()}. Two warm-up strokes, then ten scored strokes.`);
    $('#boat-height').focus({ preventScroll: true });
    renderStatus();
  }

  function finish() {
    controls.enable(false); $('#moving-toggle').disabled = true;
    $('#moving-toggle').textContent = 'Run complete';
    root.dataset.state = 'complete';
    const result = run.summary();
    $('#moving-drive-score').textContent = `${result.drive}%`;
    $('#moving-recovery-score').textContent = `${result.recovery}%`;
    $('#moving-drive-result').hidden = run.mode === 'recovery';
    $('#moving-recovery-result').hidden = run.mode === 'drive';
    $('#moving-choice-result').textContent = `${result.overall}% correct choices · ${result.correct} of ${result.total} phases.`;
    $('#moving-score-note').textContent = 'Your longer input direction wins each phase.';
    $('#moving-summary').hidden = false;
    const next = run.mode === 'drive' ? 'Recovery practice' : run.mode === 'recovery' ? 'Continuous rowing' : 'Drive practice';
    $('#moving-next-exercise').textContent = `Try ${next}`;
    announce(`Run complete. ${result.correct} of ${result.total} directions correct. ${run.mode !== 'recovery' ? `Drive ${result.drive} percent. ` : ''}${run.mode !== 'drive' ? `Recovery ${result.recovery} percent.` : ''}`);
    if (['boat-height', 'boat-canvas', 'boat-raise', 'boat-lower'].includes(document.activeElement?.id)) $('#moving-again').focus({ preventScroll: true });
  }

  function renderStatus() {
    const pose = run.pose, ref = pose.reference;
    const warm = ref.cycle < run.warmupCycles;
    const active = ['drive', 'recovery'].includes(ref.phase) && (run.mode === 'continuous' || ref.phase === run.mode);
    const angle = Math.abs(toDegrees(run.lean));
    const balance = angle <= 1.5 ? 'Level' : `Bowside ${angle.toFixed(1)}° ${run.lean > 0 ? 'high' : 'low'}`;
    const phase = phaseNames[ref.phase];
    $('#moving-phase').textContent = !started ? 'READY TO ROW' : run.finished ? 'RUN COMPLETE' : phase;
    $('#moving-stroke').textContent = !started ? '2 warm-up + 10 scored' : run.finished ? '10 / 10 strokes' : warm ? `Warm-up ${ref.cycle + 1} / 2` : `Stroke ${Math.min(10, ref.cycle - 1)} / 10`;
    $('#boat-challenge').textContent = !started ? `You’re rowing ${sideName()}. Find your rhythm.` : run.finished ? 'Ten strokes. Keep finding that feeling.' : ref.phase === 'drive' ? 'Squared blade. Find the right depth.' : ref.phase === 'recovery' ? 'Feathered blade. Keep the boat quiet.' : ref.phase === 'catch' ? 'Square, place, and connect.' : 'Extract, feather, and send it away.';
    $('#moving-cycle-marker').style.left = `${run.finished ? 100 : ref.fraction * 100}%`;
    $('#boat-angle').textContent = balance;
    $('#boat-needle').style.left = `${50 + run.lean / MOVING.maxLean * 46}%`;
    root.classList.toggle('boat-is-level', pose.level);
    $('#moving-blade-caption').textContent = ref.phase === 'recovery' ? 'BLADE CLEARANCE' : 'BLADE DEPTH';
    $('#moving-blade').textContent = ref.phase === 'drive' ? `${pose.bladeStatus} · ${Math.round(pose.shaftWetFraction * 100)}% shaft submerged` : pose.bladeStatus;
    let feedback, quality = 'neutral';
    if (!started) feedback = 'Start with a light touch. The first two strokes are warm-up.';
    else if (run.finished) feedback = 'Run complete. Try again, or explore another exercise.';
    else if (!run.running) feedback = 'Stroke and scoring are paused.';
    else if (!active) feedback = run.mode !== 'continuous' && ['drive', 'recovery'].includes(ref.phase) ? `Automatic ${ref.phase} — your next ${run.mode} is coming.` : 'Automatic transition — keep your correction steady.';
    else if (pose.missedWater) { feedback = 'The rower missed the water! Raise the handle to place the blade.'; quality = 'error'; }
    else if (pose.bladeStatus === 'Shaft buried') { feedback = 'Shaft buried; your side is lifting. Lower the handle.'; quality = 'error'; }
    else if (pose.bladeStatus === 'Too deep') { feedback = 'Too deep; your side is lifting. Lower the handle gently.'; quality = 'correct'; }
    else if (pose.bladeStatus === 'Blade too high') { feedback = 'Blade too high; your side is dropping. Raise the handle.'; quality = 'error'; }
    else if (['Blade out', 'Washing out'].includes(pose.bladeStatus)) { feedback = 'The blade is washing out. Raise the handle gently.'; quality = 'error'; }
    else if (['Water contact', 'Too close'].includes(pose.bladeStatus)) { feedback = 'Blade near the water. Find the level and keep it clear.'; quality = pose.bladeStatus === 'Water contact' ? 'error' : 'correct'; }
    else if (pose.bladeStatus === 'Too high') { feedback = 'Blade too high. Find the level with a lighter touch.'; quality = 'correct'; }
    else if (!pose.level) {
      const ownSideHigh = (run.lean > 0) === (run.side === 'bow');
      feedback = ownSideHigh ? 'Your oar side is high. Lower the handle gently.' : 'Your oar side is low. Raise the handle gently.';
      quality = 'correct';
    }
    else { feedback = ref.phase === 'drive' ? 'Good depth. Keep the boat level.' : 'Blade clear. A quiet recovery.'; quality = 'good'; }
    $('#moving-feedback').textContent = feedback;
    root.dataset.quality = quality;
    $('#moving-run-note').textContent = warm && started ? 'Warm-up. Feel the stroke before the faults begin.' : 'A fresh correction after the catch and after feathering.';
    const score = run.summary();
    $('#moving-live-score').textContent = run.mode === 'drive' ? `Drive ${score.drive}%` : run.mode === 'recovery' ? `Recovery ${score.recovery}%` : `Drive ${score.drive}% · Recovery ${score.recovery}%`;
    controls.describe(`${Math.round(trimToPercent(run.correction))}% of correction range. ${phase}. ${pose.bladeStatus}. ${balance}.`);
    // Announce phase changes, not every decimal change of the roll indicator.
    if (run.running && (lastPhase !== ref.phase || lastStroke !== ref.cycle)) {
      if (ref.phase === 'drive' || ref.phase === 'recovery') announce(`${warm ? 'Warm-up' : `Stroke ${ref.cycle - 1}`}. ${phase.toLowerCase()}. ${pose.missedWater ? 'The rower missed the water! ' : ''}Slider reset to centre. ${active ? 'Your control.' : 'Automatic.'}`);
      lastPhase = ref.phase; lastStroke = ref.cycle;
    }
  }

  function animate(time) {
    if (stopped) return;
    const dt = previousTime === null ? 0 : Math.min((time - previousTime) / 1000, 0.05);
    previousTime = time;
    if (run.running && !document.hidden) {
      const resets = run.resetCount;
      controls.tick(dt); run.advance(dt);
      if (run.resetCount !== resets) controls.sync(run.correction);
      if (run.finished) finish();
    }
    scene.update(run);
    if (time - uiTime > 80) { renderStatus(); uiTime = time; }
    frame = requestAnimationFrame(animate);
  }

  $('#moving-toggle').addEventListener('click', toggle);
  $('#moving-restart').addEventListener('click', () => { prepare(); $('#moving-toggle').focus({ preventScroll: true }); });
  $('#moving-mode').addEventListener('change', prepare);
  $('#moving-rate').addEventListener('change', prepare);
  $('#moving-again').addEventListener('click', () => { prepare(); toggle(); $('#boat-height').focus({ preventScroll: true }); });
  $('#moving-next-exercise').addEventListener('click', () => { $('#moving-mode').value = run.mode === 'drive' ? 'recovery' : run.mode === 'recovery' ? 'continuous' : 'drive'; prepare(); $('#moving-toggle').focus({ preventScroll: true }); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); previousTime = null; });
  window.addEventListener('blur', () => pause(true));
  window.addEventListener('pagehide', event => { pause(true); cancelAnimationFrame(frame); if (!event.persisted) { stopped = true; scene.dispose(); } });
  window.addEventListener('pageshow', event => { if (event.persisted && !stopped) { previousTime = null; frame = requestAnimationFrame(animate); } });
  prepare(); $('#boat-load-message').hidden = true;
  frame = requestAnimationFrame(animate);
}
