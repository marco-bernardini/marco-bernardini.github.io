# Balance the Boat

A browser-only sweep-rowing balance exercise, integrated into the existing Quarto website at `/games/balance-the-boat/`.

## Play

Boat Still puts a rower at the finish with a feathered blade supported by calm water. Each challenge starts visibly unbalanced with the slider centred at 50%; the middle represents the starting handle height, not the balanced height. Drag the vertical slider, click the raise/lower buttons, or focus the slider/scene and use Up/Down. Hold within 1 degree of level with low roll speed for 0.8 seconds to finish a challenge. Next challenge deals a different situation and recentres the slider. Every four challenges cover all combinations of oar side and initial bowside high/low.

**Boat Moving**, at `/games/balance-the-boat/moving.html`, offers Drive practice, Recovery practice, and Continuous rowing. Choose **8 strokes/minute (easy)** or **12 strokes/minute (hard)**, then Start rowing. The first two strokes are unscored; the next ten receive separate drive/recovery direction-choice percentages. Pause/Resume and Restart are available. Leaving the tab or window pauses the exercise and requires an explicit Resume.

During the drive, lower the handle to correct a deep squared blade and a lifting oar side, or raise it to correct a high blade and a dropping oar side. High-blade faults now miss placement at the catch; the blade stays above the water and the feedback says “The rower missed the water!” until it is placed. During recovery, the blade is feathered above water; bring the boat level while keeping the blade clear. The automatic stroke path handles the slide, body sequence, catch, release, and feathering. The slider resets to centre after the catch and after feathering, requiring a fresh correction for each drive and recovery. The physical handle settles smoothly through each reset. In practice modes the other phase is automatic.

Progress is session-only and resets when the page is reloaded. No data leaves the game.

## Preview and render

From the repository root:

```powershell
quarto preview games/balance-the-boat/moving.qmd
```

Or render the published pages and serve the `docs/` folder:

```powershell
quarto render games/index.qmd
quarto render games/balance-the-boat/index.qmd
quarto render games/balance-the-boat/moving.qmd
python -m http.server 8765 --bind 127.0.0.1 --directory docs
```

Open `http://127.0.0.1:8765/games/balance-the-boat/` and choose Boat Moving, or open `http://127.0.0.1:8765/games/balance-the-boat/moving.html` directly. Serve over HTTP; ES modules do not work reliably with `file://` URLs. After edits, render the game pages again to copy styles and modules to `docs/`, then reload the browser. The Games navbar entry is configured in `_quarto.yml`; rendering other pages refreshes their navbar too.

No npm install or bundler is needed. The small package manifest selects ES module mode for Node's built-in test runner:

```powershell
node --test games/balance-the-boat/tests/*.test.js
```

## Code map

- `index.qmd`: accessible game UI and instructions within Quarto.
- `assets/game.css`: scoped desktop and phone layout.
- `js/boot.js`: module-load and WebGL initialization fallback.
- `js/balance.js`: shared oar geometry, unilateral blade support, damped roll, success timing, and shuffled challenges.
- `js/scene.js`: procedural shell, rigger, oar, translucent rower, two-bone arm tracking, and responsive rear camera.
- `js/controls.js`: pointer/touch slider, button, and scoped keyboard input.
- `js/game.js`: game lifecycle, status announcements, visibility handling, success and next-round UI.
- `moving.qmd` and `assets/moving.css`: moving-mode UI, exercises, results and responsive styling.
- `js/stroke.js`: stroke clock, reference pose, shared blade perimeter, rigid rig and blade bounds.
- `js/moving-balance.js`: transformed blade coverage, depth/clearance classification and moving crew-load response.
- `js/moving-challenges.js`: shuffled fault templates and smooth transitions.
- `js/moving-run.js`: pure fixed-substep run engine, warm-up, pause, phase scoring and incident counts.
- `js/moving-game.js`: moving-mode controls, lifecycle and accessible feedback.
- `tests/balance.test.js`: correction directions, equilibrium, lever lengths, contact, overshoot, success timing, frame rates, reachability, and shuffle coverage.
- `tests/moving.test.js`: stroke continuity, extraction/placement, reachable arm motion, blade immersion, airborne recovery, fault solvability, warm-up/pause/scoring, incident counting, complete runs and frame-rate consistency.

## Model and coordinates

Positive lean means bowside high. The boat rotates by negative lean around its longitudinal axis. The camera looks aft from the bow, so screen left is bowside/starboard and screen right is strokeside/port.

The rigid oar's handle, blade and gate use the same geometry in the simulation and renderer. Blade contact is a compression-only spring: a blade above water exerts zero support. A constant passive crew torque balances the neutral support load, and hull stiffness plus damping make the boat settle. Each starting handle height is solved from torque equilibrium at a random 6–12 degree lean, rather than inventing an unrelated boat angle. The stationary slider maps 50% to that round's starting height, with each half of its travel reaching the original minimum/maximum physical height. Thus every round starts centred while the solution can be either above or below centre. The calibrated range is bounded at 18 degrees of roll.

This is a constrained teaching model of a rowing station in a crew shell. It is not full fluid dynamics, an independently balanced one-person sweep boat, or a model of every phase of a stroke. The fixed camera and static water make roll readable. Narrow screens frame the active oar more tightly while retaining the rear view and complete blade.

### Moving model

The moving clock has catch (5%), drive (29%), release (6%), and recovery (60%) portions. The gate stays fixed. Blade depth is derived from the same sampled perimeter, thickness and orientation used to create the mesh. The normal path solves for a blade top 4.5 cm below the model water surface during the drive and a lower edge 11.5 cm above it during recovery. These are calibrated game geometry values. Placement and extraction join these bands continuously, squaring before placement and extracting before feathering.

Player correction is bounded at +/-12 cm of handle travel. Drive faults now include both deep and high-blade mistakes, with signed handle-height errors of 7–9 cm. Each four-template bag contains both drive directions crossed with both recovery carry directions. Recovery carry faults remain +/-3.2–4.4 cm. Each run keeps the same oar side.

At entry to drive and recovery, the player command resets to zero and the visible thumb returns to 50%. Outgoing input fades through the transition before the reset, and fresh input has a short pickup with a 55 ms smoothing time, so the physical handle does not jump. Deep drive faults grow over 0.35 seconds after placement. High-blade faults are introduced during the catch and skip placement; a shared-geometry clearance constraint keeps the entire blade above the surface until an upward correction restores entry. Recovery fault scheduling is unchanged. Pausing does not cause additional resets.

Roll uses a damped effective crew-load model. The drive deliberately exaggerates a faulty draw path: excessive draw height lifts the rower's side, and a roll-dependent draw-height coupling increases shaft immersion further. A low draw drops that side and carries the blade progressively higher. A large uncorrected drive typically produces 10–15 degrees of roll; deep cases can immerse more than 40% of the exposed outboard shaft. Roll feedback reduces as the error is corrected, and stronger drive damping/restoring response makes the mistake recoverable. The gate stays attached to the boat and the oar stays rigid. This is a coaching exaggeration of the combined draw-path and balance error, not a claim that raising a rigid hull alone pushes its blade deeper.

The recovery gain, stiffness, damping and compression-only contact response are unchanged. Recovery still models unloaded crew carry, oar/rower mass and gate loads, with zero water support from an airborne blade. Correctly cancelling a fault gives both proper depth/clearance and a flat boat on either rig.

Scores count direction choices, not time at ideal depth or balance. Each completed drive/recovery is one opportunity. The required direction is opposite the sign of the generated height/carry fault: lower for a deep/high-carry error, raise for a missed-water/low-carry error. Each phase accumulates active Up and Down input durations. Held keys contribute their actual hold time, drags contribute bounded movement intervals, and button taps contribute equal short pulses. The longer direction wins; ties and no-input phases earn no credit. Programmatic slider resets, warm-up, transitions, pauses and automatic practice phases contribute no input votes. Each phase is counted once on completion, with separate drive and recovery percentages and an overall correct-choice count. Blade contact, roll, depth, overshooting and correction timing do not reduce these percentages.

The geometric quality bands and sustained-contact diagnostics are retained only for coaching feedback. They are not scoring criteria or score penalties. Scores are session-only.

The moving surface is locally translucent, with underwater blade and shaft tints and a white guide at the shaft's actual surface intersection. The readout reports the fraction of exposed outboard shaft submerged. Restrained water-line flow suggests forward motion. Boat Still keeps its stationary scene and mechanics.

## Dependencies and compatibility

Three.js **0.170.0** is vendored in `assets/vendor/three.module.min.js`; its MIT license is included in the same directory. It is loaded locally, with no CDN or runtime network API. The rest of the game is original procedural geometry and plain JavaScript/CSS.

Requires a modern browser with JavaScript and WebGL 2. Initialization/module failures and WebGL context loss show a reload/help message. Semantic buttons, a native range slider, text descriptions, focus outlines and polite status announcements complement the 3D view. Decorative UI transitions respect reduced-motion preferences; essential boat movement remains visible.

The original [proposal](PROPOSAL.md) and accepted [moving proposal](MOVING_PROPOSAL.md) record the design briefs.
