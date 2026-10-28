# Boat Moving — continuous stroke proposal

Status: proposal for review. Boat Moving has not been implemented. The Boat Still correction in this request removes only the in-scene HANDLE HEIGHT callout and its supporting code/styles.

## Recommendation

Reuse the existing character, shell, oar, rear camera, visual style, and input controls. Add continuous, automatically animated rowing. The player controls vertical handle correction throughout each stroke; the computer handles stroke timing, slide movement, body sequencing, feathering, squaring, extraction, and placement.

Start with two short practice exercises, Drive and Recovery, then combine their rules into Continuous Rowing. These share one animation and geometry system rather than becoming separate implementations.

## One complete stroke

The visible rhythm is DRIVE → RECOVERY → DRIVE. Short catch and release transitions connect the two scored phases:

| Part | Animated action | Player's objective |
| --- | --- | --- |
| Catch transition | Square the blade and place it; the rower is compressed with arms extended | Retain control while placement is completed automatically |
| Drive | Squared blade; legs extend, body opens, then arms draw the handle in | Keep the blade covered at a suitable depth and the boat close to level |
| Release transition | Extract the blade, then feather it | Retain control while extraction and feathering happen automatically |
| Recovery | Feathered blade travels above water; arms go away, body rocks over, knees bend and seat moves toward the catch | Keep the boat level and the blade clear of the surface |

Begin practice at about 12 strokes/minute: a roughly five-second cycle with a shorter drive and longer recovery. Normal play can use approximately 16 strokes/minute after tuning. These are game pacing choices. All part durations and easing curves are parameters, not hard-coded assumptions about every rower's technique.

The release and catch need narrow scoring exclusions: intended blade exit/entry is not an error. They are not long safe windows for an otherwise incorrect drive or recovery.

## Controls

The slider continues to mean Up = raise the handle and Down = lower the handle. Pointer, touch, buttons, and arrow keys retain the existing convention.

It adjusts a small height correction around the automatically animated hand path:

```js
handleHeight = referenceHeight(strokePhase)
             + mistakeOffset(strokePhase, challenge)
             + playerCorrection;
```

`referenceHeight` includes the normal difference between drive, extraction, recovery, and placement. Thus the player corrects a technical fault while the rower still performs a coherent stroke. The slider's visible value is the player's correction, not the rower's complete vertical motion.

Keep the player's correction when the phase or stroke changes. New mistakes blend in smoothly; neither the slider nor boat roll snaps to a new position. Pause freezes stroke time, physics, and scoring; a hidden browser tab pauses the exercise too.

## Drive exercise

The blade is squared and its immersed portion remains visible through a locally translucent patch of water. A subtle horizontal surface line and underwater tint make depth legible without labels pointing at the handle. A small depth indicator outside the scene can report Deep / Good / Shallow / Out of water.

The main introduced fault is excessive handle height: the blade is too deep. Lowering the handle raises the blade toward the correct band. Overcorrection can make the blade partly emerge or leave the water during the loaded part of the drive. A later variant can begin slightly shallow, while still providing time to react before scoring.

Measure actual coverage of the squared blade from its transformed geometry. The current stationary contact probe uses the thickness of a feathered blade and cannot classify the depth of a squared blade. The target band should be calibrated to the existing blade dimensions, with the blade covered and a reasonable margin. Avoid prescribing a universal depth in centimetres before this calibration.

Sustained excessive depth reduces the drive score and produces a gradual roll response representing this rower's handle-height mismatch within a crew. Washing out is recorded as an error. An error is counted once per sustained incident, rather than on every animation frame, and does not stop the rowing.

## Recovery exercise

The blade is feathered above the surface. Introduce a height/carry fault which makes bowside or strokeside fall. The player corrects the handle until the boat returns toward level while retaining blade clearance. A blade that grazes the water gives a visible contact cue and reduces recovery quality.

This requires a moving balance model. An airborne blade supplies no water support, so the stationary feathered-blade contact spring must not be treated as its balancing force. Recovery roll should use a calibrated model of crew carry, rower/oar mass distribution, and gate loads; accidental blade contact contributes a separate water force.

The first mechanical prototype must validate both mirrored rigs with the blade in the air. If this needs an effective crew-response approximation, document it explicitly and check the correction directions before building the challenge progression. Do not claim that blade height alone determines all real recovery balance.

## Continuous rowing and varied faults

For the initial combined mode, each complete stroke has one drive-depth challenge and one recovery-height challenge. Keep the rower's oar side fixed for a run; choose bowside/strokeside at the start. Changing rig side between continuous strokes would look like changing seats and would break the exercise's physical continuity.

Examples:

| Stroke | Drive | Recovery |
| --- | --- | --- |
| 1 | Moderately deep | Bowside starts falling |
| 2 | Slightly shallow | Strokeside starts falling |
| 3 | Deep error emerging later in the drive | Strokeside starts falling, with a different magnitude |
| 4 | A smaller deep error | Bowside starts falling |

Use a constrained shuffled deck rather than independent random values each frame. Vary error direction, magnitude, and eventually onset, while preventing consecutive identical challenge templates. Practice starts with predictable onset; later-onset faults belong to subsequent difficulty tuning.

Generate the height/carry fault first and let its geometry and loads produce the resulting roll. Do not independently assign a random blade-depth error and a random boat lean that could demand opposite inputs. The blade-depth/clearance and roll tolerances must have an overlapping solution within the player's correction range for every generated case.

The challenge remains stable long enough for a person to identify and fix it. Smooth bounded changes preserve the previous roll angle and angular velocity, provide a short reaction grace period when a new fault is introduced, and retain the player's input. They never directly overwrite boat roll to create an instantaneous visual error.

## Feedback and scoring

Keep the scene as clean as Boat Still. Outside it, show the current phase, a small cycle-progress indicator, boat balance, and a phase-specific depth/clearance indicator.

During a run, show brief feedback such as Too deep, Blade out, Blade touched water, or Good stroke. Rowing continues through both success and error. Use colour plus shape/text; essential feedback must not depend on sound.

Recommend two unscored settling strokes followed by ten scored strokes. Score drive and recovery separately by time within the acceptable bands, and count clean strokes. A drive can earn partial credit after a correction; a recovery must satisfy both clearance and balance. Set the final clean-stroke threshold after playtesting rather than choosing a difficult percentage now.

After the run, show a short summary with drive control, recovery balance, and clean strokes, followed by Try again. Provide Pause and Restart. There is no need for lives, an abrupt game-over, accounts, or a leaderboard.

## Changes to the 3D model

The existing meshes are reusable; their joint placement needs to become animated:

- Group hips and torso so the seat can travel along the slide and the torso can rock through the stroke.
- Replace fixed leg endpoints with hip–knee–ankle chains. Feet stay on the stretcher; knee bend follows seat position.
- Keep the existing hand-to-grip tracking, with moving shoulders and elbows.
- Animate oar sweep angle around the fixed gate and blade rotation around the shaft. Feathering must visibly change the blade from upright to flat.
- Calculate the shared blade pose once, then use it for rendering, immersion, clearance, forces, and scoring.
- Frame the complete stroke envelope with a fixed camera. Avoid zooming or moving the camera each time the oar swings. Retain the tighter phone framing where necessary.
- Convey forward motion with restrained water flow/wake while keeping the boat and camera in a readable local frame. Translation down an endless river is not required for the first version.

All of this can be done procedurally in Three.js; no replacement character asset or external animation package is required.

## Code organization

Keep Boat Still's model and challenge loop separate from moving-mode physics, while sharing the visual assets and input components.

```text
js/
  balance.js             # existing stationary mechanics
  controls.js            # existing shared height controls
  scene.js               # shared scene; extend to accept an articulated pose
  game.js                # existing Boat Still lifecycle
  stroke.js              # new: phase clock and reference pose curves
  moving-balance.js      # new: drive/recovery loads, blade coverage and roll
  moving-challenges.js   # new: solvable fault schedule and progression
  moving-game.js         # new: run state, phase scores, pause and summary
```

Conceptually, each frame is:

```js
const phase = strokeClock.advance(dt);
const reference = strokePose(phase);
const fault = challenges.sample(phase);
const handle = reference.height + fault.heightOffset + controls.correction;
const pose = rigPose(reference, handle, boat.lean);

movingBalance.advance(boat, pose, phase, fault, dt);
score.sample(phase, pose, boat, dt);
scene.update(pose, boat);
```

This is an architectural sketch, not final code. The implementation should use fixed physics substeps and one authoritative geometry evaluation per substep, with rendering based on the resulting state. Phase timing follows elapsed active time rather than frame count.

## Implementation milestones

1. **Correct continuous animation:** demonstrate clean strokes with automatic hands, seat, legs, torso, blade sweep and feathering. Verify both sides, joint reach, water visibility and phone framing.
2. **Mechanical teaching prototype:** add drive depth and recovery roll/clearance controls. Validate the loaded/unloaded balance response, all correction directions, and the overlap of acceptable depth and roll targets. This is the main technical risk and should be resolved before scoring.
3. **Practice modes:** introduce one isolated fault type at a time, clear feedback and pause/resume. Tune how much reaction time a learner needs.
4. **Continuous game:** add per-stroke faults, non-repeating templates, persistent player input, ten-stroke runs, separate phase scores and the result summary.

Acceptance includes no artificial washout penalty at catch/release, no water support from an airborne blade, reachable solutions for every template, continuous positions and velocities at phase boundaries, no accumulated score while paused/hidden, consistent results at different frame rates, and continued passing Boat Still tests.

## Technical references

- [USRowing: The Stroke](https://usrowing.org/learn-about-rowing/overview/the-stroke) describes the body sequence and blade transitions. It supports the animation sequence, not the proposed game scoring or a particular simulation equation.
- [World Rowing coaching manual: Sweep Rowing Technique](https://worldrowing.com/wp-content/uploads/2020/12/3Chapter2_English-1.pdf) discusses draw height, blade depth, washing out and technical corrections. The continuous game still needs a calibrated mechanical prototype; these coaching descriptions do not supply a complete recovery-force model.

The stroke pacing, error deck, scoring and effective crew response above are proposed game-design and modelling choices.
