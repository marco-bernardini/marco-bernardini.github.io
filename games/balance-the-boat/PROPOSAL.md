# Balance the Boat — first-version proposal

Status: proposal and folder scaffold, 28 October 2026. No playable game or website navigation has been added yet.

## Confirmed brief

- Create a Games section containing Balance the Boat.
- Build **Boat Still** first. Reserve **Boat Moving** for a later version.
- Teach the real direction of the rowing response to handle height.
- Show a sweep rower from behind, sitting at the finish, with a feathered blade resting on the water.
- Randomize the rower's side and whether bowside starts high or low.
- Use a slider operated by pointer/touch or the Up/Down arrow keys.
- Show success when the user balances the boat, then offer another situation.
- Use a simple, rounded, Wii-like character, with a translucent body and clearly visible handle, oar, and boat roll.

## Project assessment

The repository is a Quarto website. `_quarto.yml` defines the navbar, the Lux theme, and the generated output directory, `docs/`. Pages are authored in `.qmd` files. Existing interactive material uses JavaScript directly in pages and standalone widgets; there is no existing Node application, package manifest, or 3D engine.

Quarto 1.8.26, Node, and Python are available locally. Generated HTML is tracked in Git. No deployment workflow was found in a local `.github` directory; the remote GitHub Pages configuration has not been inspected.

Recommendation: preserve Quarto and use a small browser-only Three.js scene. This can run on GitHub Pages with no server, database, accounts, or new application framework. Vendor a pinned Three.js module with its license so gameplay does not require a third-party CDN at runtime.

Existing uncommitted edits to `latex/randomness/diffusions.qmd`, its generated HTML, and `docs/search.json` are outside this task.

## Proposed experience

1. Open **Games → Balance the Boat** and select **Boat Still**. Show Boat Moving as coming next.
2. Show one centered rowing station, a rower at the finish, one sweep oar, calm water, and a fixed horizontal reference. The rower's side and the initial lean are identified in words.
3. Place a vertical slider beside the scene: moving up raises the handle, moving down lowers it. Pointer and touch dragging, Up/Down keys, and accessible raise/lower buttons use the same input state. Keyboard handling is limited to the game controls so it does not take over the whole page.
4. Respond continuously: hands follow the grip, the oar pivots at its gate, and the boat settles toward its new roll angle. The camera and water stay level.
5. When the boat stays within approximately 1 degree of level for 0.8 seconds and is no longer rolling appreciably, display **Balanced!** and a **Next challenge** button. These are initial tuning values.
6. Show a short explanation of the successful correction. Wait for Next challenge before resetting.

Avoid a visible slider sweet spot: the user should read the boat and waterline. A small balance indicator can reinforce the scene. Colour is supported by text, angle, and position. No timer, lives, leaderboard, sound, or capsize sequence is needed for this version.

## Four situations and correction directions

Use **strokeside** and **bowside** for oar sides. “Stroke” alone can also mean a seat or a movement.

| Rower's oar side | Initial boat state | Correct handle adjustment |
| --- | --- | --- |
| Bowside | Bowside high | Lower |
| Bowside | Bowside low | Raise |
| Strokeside | Bowside high | Raise |
| Strokeside | Bowside low | Lower |

This table is the proposed mechanical consequence of the agreed supported, feathered-blade setup: raising the handle pushes the outboard end against the water and increases support at the active oarlock; lowering it reduces that support. It should be checked against the rendered lever geometry before gameplay is accepted. It is not a general rule for every blade position or phase of a moving stroke.

Use a shuffled bag of all four cases, with a boundary check to prevent consecutive repeats. Randomize initial lean magnitude within a modest, solvable range, initially about 6–12 degrees. Start the handle in a position consistent with that lean rather than assigning an unrelated roll angle. Do not randomize the correct height independently of the rig geometry.

## Coordinate and physical model

The camera looks at the rower's back, from the bow toward the stern. Consequently, bowside/starboard appears on screen left and strokeside/port on screen right. Label both sides to remove the usual left/right ambiguity.

Represent a station in a crew shell with one controllable rower. The rest of the crew is abstracted as passive support; the scene is not presented as a fully simulated lone sweep rower balancing a complete crew shell.

Use one boat roll degree of freedom, a rigid oar with a fixed gate pivot, and a bounded handle-height input relative to the rowing station. A small-angle model derived from the lever geometry can determine the equilibrium roll. Smooth settling uses a damped roll response, with elapsed-time-based updates rather than frame-count-based motion.

The blade/water contact must be unilateral: water can support the blade from below, and a lifted blade loses support. It must not remain visibly glued to the surface or pull downward on the water. Keep the first exercise within a calibrated supported range where all four cases can reach balance. The hull, gate, handle, and blade must agree geometrically throughout that range.

This is a constrained teaching model of the selected exercise. Full fluid dynamics, active crew coordination, and body-weight corrections are beyond the first version. Boat Still has no artificial waves or periodic disturbances.

## Creating the 3D rower

Build the character procedurally in JavaScript. No user-supplied model or external modelling work is required.

- Rounded head, tapered torso, simple hips, capsule limbs, and small hands/feet; original proportions inspired by the friendly simplicity of Wii characters.
- Fixed seated finish pose with straight legs and a slight backward torso lean. Jointed arms follow two grip points on the handle while shoulders remain attached to the torso.
- Muted blue-grey body at roughly 35–45% opacity. Test the fixed camera for transparency sorting problems and overlapping limb surfaces.
- Opaque warm yellow handle, a clearly readable shaft, and a contrasting blade. Keep these visible through the translucent torso without making geometry behind the boat appear incorrectly in front.
- A narrow shell with a readable gunwale, visible gate/rigger, and restrained water ripples/contact cues. Use lighting and a stable waterline to make roll obvious.
- Mirror the rig and appropriate pose geometry for bowside and strokeside, preserving the same control convention: Up always raises the handle.

Use a fixed rear camera, slightly elevated to reveal the handle through the body. Frame the full oar and its water contact, including on narrow screens. Reserve decorative detail until the handle-to-roll relationship is clear.

## Planned source layout

```text
games/
  README.md                       # created
  index.qmd                       # planned Games landing page
  balance-the-boat/
    PROPOSAL.md                   # this proposal
    index.qmd                     # planned Quarto game page
    assets/                       # created
      game.css                    # planned scoped styles
      vendor/                     # planned pinned Three.js and license
    js/                           # created
      game.js                     # planned lifecycle and round state
      scene.js                    # planned procedural meshes and animation
      balance.js                  # planned geometry/roll response
      controls.js                 # planned pointer, touch, keyboard input
```

Use a full-width Quarto page without a table of contents. Keep scene markup and UI on the same page, with scoped CSS and ES modules; an iframe is not required. During implementation, register the assets and module directories as Quarto resources and check the rendered relative URLs.

Expected published paths are `/games/` and `/games/balance-the-boat/`, backed by generated `index.html` files under `docs/`.

## Implementation sequence and acceptance

1. **Mechanical scene:** create the hull, gate, rigid oar, water plane, and height control. Verify the four correction directions and water contact before adding the character.
2. **Visual scene:** add the procedural rower and hand tracking. Check both mirrored rigs, translucency, and handle visibility.
3. **Round flow:** implement the shuffled cases, reachable starting states, balance hold, success message, explanation, and Next challenge.
4. **Site integration:** add the Games pages and navbar entry, copy local resources through Quarto, and verify the generated links.

Acceptance checks:

- Each of the four cases starts visibly unbalanced and can be solved with the documented correction.
- Wrong-direction input worsens the lean within the calibrated range; overshooting level tilts the opposite way.
- Boat roll, gate position, oar pivot, hands, and blade contact remain consistent.
- Success requires a stable hold rather than briefly passing through level.
- Next challenge clears prior success and timing state and avoids repeating the same case immediately.
- Mouse, touch, keyboard, visible focus, and status announcements work. Text describes side and balance for users who cannot read the 3D view.
- Desktop and narrow phone layouts keep the handle, blade, waterline, and controls readable.
- Unsupported WebGL or a failed module load produces a useful message rather than an empty game area.
- Only intended game/navigation outputs are included in the final Git diff; unrelated existing edits are preserved.

No playable code has been built or tested at the proposal stage.

## Boat Moving, later

Reuse the same meshes, controls, round state, and coordinate conventions. Before implementation, define whether “moving” means a gliding boat or an animated stroke cycle. An animated drive/recovery will need phase-specific blade contact and handle response, a moving baseline handle path, and a longer balance objective. That should follow validation of the still-water teaching model.

## References

- [British Rowing glossary](https://www.britishrowing.org/knowledge/rower-development/british-rowing-technique/glossary/) — side names, sweep rowing, feathering, and tap-down terminology.
- [British Rowing skills assessment](https://www.britishrowing.org/wp-content/uploads/2016/06/Sculling-Festival-Skills-Assessment.pdf) — a primary example of rocking a stationary boat by moving handles with blades on the surface; the proposed sweep response additionally follows the lever model described above.
- [World Rowing Learn to Row booklet](https://worldrowing.com/wp-content/uploads/2023/11/Learn-to-Row-Booklet_V2.pdf) — sweep grip and outside-hand control of handle height.
- [Three.js transparency guide](https://threejs.org/manual/pages/transparency.html) — opacity and the depth/sorting issues to verify in the translucent character.
