# Gravity Flip

A complete offline, single-player survival game. Four canvas-drawn copilots (Orbit, Wisp, Pebble, Astro) run through an open orbital platform course inspired by the supplied visual references. All artwork, fonts, simulation, and synthesized audio run locally. No backend, account, network assets, or runtime packages.

## Run

Open `index.html` directly in a modern browser, or use Node 18+:

```sh
cd gravity-flip
npm run dev
```

Visit **http://127.0.0.1:5196**. No installation or build step is needed to play. Local storage is per browser and origin; file URLs and the local server may have different saves. If storage is unavailable the game still works and displays a small notice.

## Gravity Duel (2 players)

Open **duel.html**, or select **⚔ 2-player Gravity Duel** under *Let’s fly* on the home screen. Two pilots race a curving skyline and fight with gravity itself. Matches are best of three rounds, and every round takes place in a different arena.

**Playing together**

- **Same screen:** both players share one keyboard, or one tablet with two touch pads.
- **Two devices:** run `npm run duel`, which binds the server to your network and prints a Wi-Fi address. One player chooses **Host online room** and shares the 4-letter code. The friend types that code into the **room-code box on the home screen** (or the duel menu) and joins straight away as P2, using their saved pilot and powers. The server runs the match; both browsers send input and draw what it sends back. If someone disconnects, the duel pauses until they return. For play over the internet rather than shared Wi-Fi, host the server somewhere both players can reach.

| Action | P1 | P2 | Phone |
| --- | --- | --- | --- |
| Up / down a deck | W / S | O / L (or ↑ / ↓) | ▲ ▼ buttons, or swipe up/down on the arena |
| Fire (hold) | F | J | hold FIRE |
| Shield | D | K | ◇ |
| Dash forward | A | ; | » |
| Use / switch power | E / R | I / U | tap the power in your tray |

**Phones:** the duel is played in landscape. On a phone it asks for fullscreen landscape where the browser allows it, and in portrait it shows a "turn your phone sideways" screen. When each player uses their own phone (online), each gets a one-player layout: deck buttons under the left thumb, and FIRE, SHIELD, DASH and the power tray under the right. Two players sharing one phone or tablet each get a compact set on their side of the screen. The scoreboard shrinks to a slim strip on short screens so the arena keeps its size.

**What makes it different**

- **Bullets fall in your own gravity.** Shots from the floor or bridge arc downward, and shots from the ceiling arc upward. Auto-aim works out the arc for you, so where you stand decides your angle. The bridge, asteroids and gates block shots, except the Rail, which fires straight through cover.
- **Curved arenas.** The decks follow curves: *Tidal Arcs* (waves), *Crater Bowls* (bowls with sharp rims) and *Helix Spine* (the bridge twists against the floor and ceiling). Each round uses a different arena and seed. Running downhill in your own gravity pushes you forward, and running uphill holds you back.
- **Obstacles between the decks.** Asteroids and spinning gates float in the open air between decks. They never touch a pilot who is running on a deck, but switching decks into one costs 10 HP and bounces you back. Gold rings in the same spaces give +20 power to anyone who flies through. Shooting crates and asteroids breaks them open, and they can drop supplies.
- **Gravity powers are found, not chosen.** Glowing power orbs appear on the decks, and crates and asteroids can drop them. Each pilot gets one early orb on their starting deck; after that it's a race. You carry up to 3. The newest is selected, R/U switches between them, E/I uses the selected one, and on a phone you tap the one you want. Each orb is used once, with a 1.2 s cooldown between powers. A fourth orb with a full tray becomes +15 power instead.

| Power | Effect |
| --- | --- |
| ◉ Gravity Well | Lob a singularity. For 3 s it pulls in your rival, swallows their bullets and crushes nearby obstacles and comets. |
| ◐ Time Echo | For 4 s, a ghost of you repeats every shot 0.6 s later from where you were. Echo shots cost no ammo. |
| ☄ Comet Roll | Drop a comet onto your rival's deck ahead of them. It rolls along the curve, speeds up downhill and smashes spikes and crates on the way. Hit for 22, or shoot it down. |
| ✣ Orbit Blades | For 5 s, three blades circle you, cutting bullets, obstacles and any rival who gets close. |
| ✶ Gravity Hex | A curving bolt that flings your rival to the far deck and swaps their up/down controls for 4 s. |

**Sound and effects:** `duel-audio.js` generates everything in the browser: separate music and effects channels (toggle each with ♫ / ♪), each pilot's sounds panned to their side, a distinct sound for every gun, power, pickup, hazard, bounce and landing, a low-health heartbeat, and a soundtrack whose tempo rises when the fight starts and again in overtime. On screen: screen shake on heavy hits, trails that show each shot's curve, trails when changing decks, landing dust, power bursts, a KO flash and a red pulse at the edge for a pilot on low health. Reduced-motion settings turn off shake and decorative motion.

**Core rules:** 100 HP per round. Spikes, crates, lasers, asteroids, falling into a void (20) and dropping off the left edge (15) all cost HP, and green ✚ pickups heal 25. You start with 30 blaster rounds; every 120 m you run gives +8 rounds and +10 power, and ammo crates give +15. Power refills at 4 per second while you run. The D/K shield costs 35, lasts 1.6 s, blocks everything and bounces bullets back at the shooter. It never activates on its own. Gun pickups: Scatter, Burst, Rail, homing Rocket and the returning Boomerang. After 90 s, overtime drains both pilots so every round ends.

The arena is a fixed 1200 × 600 logical field, identical on every screen and both online devices. Tuning lives in `SETTINGS`, `ARENAS`, `WEAPONS` and `POWERS` at the top of **duel-engine.js**. When the page is hosted without a room server (for example on Vercel), it uses the server address in **duel-config.js**. **render.yaml** sets that server up on Render. `server.cjs` keeps up to 40 rooms. Each room steps its own `Duel` at 120 Hz and sends about 30 updates per second (around 2–3 KB each) over Server-Sent Events. Clients send cumulative press counters, so a delayed or repeated request never replays a move. Each seat is protected by a random token, request bodies are size-limited, and idle rooms close after 60 s. The server only serves game files: tests, package files, `node_modules` and dotfiles return 404.

## Play

Choose a copilot and select **Let’s fly**. On the Ready screen, tap the playfield or select **Launch run**. The launch does not flip gravity; the first hazard arrives after about 2.7 seconds.

- **Tap / left click / Space / Arrow Up:** reverse gravity immediately.
- **Hold F / X or the FIRE button:** shoot. Blue cargo drones are optional bounty targets; aim assist nudges shots toward nearby drones. The machine gun fires continuously at about 13 rounds per second with a limited magazine: start with 48 rounds, earn +32 every 150 m, and collect green crates for +24 (96-round reserve cap). Touch supports holding FIRE with one finger and flipping with another.
- **P / Escape / pause button:** pause. Select Resume or press P/Escape to continue.
- **Sound:** persistent toggle, available in every state. Layered synthesized flip sweeps, staccato machine-gun reports, impacts, explosions, melodic star notes, and reward arpeggios use a master limiter and bounded voice count.
- **Coral edges and machinery:** spikes, stepped towers, suspended bridges, open arches, telescoping pistons, and moving drifters are hazardous. A shield absorbs one hit; otherwise contact ends the run. The glowing platform edges are safe to land on, including slopes and terraces. Amber beacons mark deck ends. Floor and overhead gaps have no collision surface: flip to the opposite platform before falling into the void. A shield does not protect against a fall.
- **Stars:** optional risky approaches to spikes and three-star trails along architectural routes. Lifetime stars unlock Wisp at 5, Pebble at 15, Astro at 30. All share identical physics and hitboxes.
- **Close calls:** clearing a hazard within 10 logical units earns 5 bonus points once, only after safely passing it. Distance stays separate from bonus points and stars.
- **Power-ups:** collect diamond **Shield** for one protected hit, **Magnet** for 8 seconds of visible star attraction: stars accelerate toward the avatar with golden trails and are credited only on arrival, and **Slow time** for 6 seconds at 72% scroll speed. **Piercing** (cyan) loads 18 rounds that punch through up to three targets with 3 damage each. **Plasma** (orange) loads 18 explosive rounds with a 100-unit splash radius and 3 damage. Special rounds auto-equip, use their own magazine, and fall back to regular bullets when exhausted. A new special pickup replaces the current special magazine. **Overdrive** adds 24 regular rounds, lasts 8 seconds and grants faster triple shots at 20 bursts per second, spending one round per burst. **Gold Rush** lasts 10 seconds and doubles star-pickup rewards and combat bounties. Effects activate automatically; icons and timers show what is active. A shield shatters the contacted obstacle and does not earn a close-call bonus.
- **Combat rewards:** blue drones pay 3 reward stars and 25 points. Mechanical obstacles take 3 hits and spikes take 2; destroying either pays 1 reward star plus 10 points. Broken hazards disappear into animated shards. Destroying an obstacle never restores missing platforms. Every third destruction within a chain of 4-second windows adds 5 reward stars. Gold Rush doubles these bounties. Picked-up stars remain a separate counter; their doubled portion goes into reward stars.
- **Star chains:** collect 5 stars with no gap longer than 3 seconds for +15 points; each additional set of 5 adds another bonus.
- **Flip Rush:** announced groups of 3 alternating hurdles begin after the introduction; later groups contain 4. Clear every hurdle without a shield hit for 6–8 bonus stars and 75–100 points. Progress appears in the status strip, and each hurdle is numbered. A shield still saves you, but forfeits the clean-clear reward. Normal sections between rushes provide breathing room.
- **Milestones:** every 250 m awards 3 bonus stars toward cosmetic unlocks, separately from stars collected during the run.
- **Best marker:** shows the best distance recorded before the current run.

Runs bank distance, collected stars, and reward stars on a crash or when leaving through Home. Retry starts immediately with a fresh runway. A 650 ms post-crash guard prevents delayed pointer events from restarting a run. Hiding the tab, losing focus, or a long animation interruption pauses the game and requires explicit resume. Reduced motion removes the running cycle, bob, recoil, landing compression, muzzle flashes, trail, particles, and menu drift; background parallax is also frozen. Necessary movement and floor/ceiling orientation remain. Timed power-ups freeze while paused.

The home screen explains Space to jump / flip, F to fire, touch controls, pause, and ammunition rewards. It uses larger headings, launch controls, portraits, and crew cards. On phones, scroll inside the home panel to reach the full crew; active gameplay stays fixed and does not scroll.

The avatar has articulated thighs, knees, shins, and boots. Alternating planted steps follow traveled distance, so cadence increases with speed. The side-profile visor, backpack, and boot toes make forward direction clear. In flight the legs tuck and the body banks with vertical motion; a quick vertical inversion keeps the face pointing right on overhead decks. Landings align the soles with the exact surface slope. The rig keeps the same circular physics hitbox for every cosmetic.

## Tuning

Edit `SETTINGS` at the top of **engine.js**:

| Setting | Default | Purpose |
| --- | --- | --- |
| `baseSpeed` / `maxSpeed` | 285 / 420 | Horizontal logical units per second |
| `speedRampMeters` | 2200 | Distance to reach the speed cap, independent of elapsed time |
| `obstacleHistory` | 800 | Retain platform/gap source geometry behind the player until it clears the widest camera |
| `themeBlendUnits` | 700 | Distance over which area palettes and scenery blend (70 m; roughly 1.7–2.5 seconds) |
| `gravity` | 3000 | Vertical acceleration |
| `flipImpulse` | 520 | Minimum immediate speed in the new direction |
| `maxVerticalSpeed` | 1450 | Vertical speed cap |
| `reactionSeconds` | 0.48 | Extra reaction budget used for obstacle spacing |
| `runway` | 800 | Logical distance before the first hazard |
| `movingAfterSeconds` | 20 | Earliest time moving hazards may be generated |
| `ceiling` / `floor` | 100 / 500 | Initial runway bounds; later rails come from `TERRAIN` |
| `radius` | 17 | Circular hitbox, smaller than artwork |
| `fixedStep` | 1/120 | Physics step in seconds |
| `nearMissClearance` / `nearMissBonus` | 10 / 5 | Close-call threshold and points |
| `startingAmmo` / `maxAmmo` | 48 / 96 | Initial and maximum regular rounds |
| `ammoRefillMeters` / `ammoRefill` | 150 / 32 | Distance between automatic ammo rewards and rounds awarded |
| `ammoCrate` / `specialAmmo` | 24 / 18 | Ammo crate reward and special magazine size |
| `shotCooldown` / `overdriveCooldown` / `bulletSpeed` | 0.075 / 0.05 / 1400 | Normal and boosted firing intervals, and bullet speed |
| `overdriveSeconds` / `doubleSeconds` | 8 / 10 | Triple-shot and doubled-reward durations |
| `magnetSeconds` / `magnetRadius` | 8 / 240 | Magnet duration and reach |
| `slowSeconds` / `slowFactor` | 6 / 0.72 | Slowdown duration and speed multiplier |
| `chainSeconds` / `chainTarget` / `chainBonus` | 3 / 5 / 15 | Star-chain timeout, target, and reward |
| `milestoneMeters` / `milestoneStars` | 250 / 3 | Distance reward cadence |
| `difficultyRampMeters` / `difficultyStepMeters` | 2000 / 300 | Intensity ramp after 80 m and threat-level cadence |
| `earlyExtraGap` / `gapJitter` | 150 / 110 | Early breathing room and randomized spacing; both taper with distance |

`TERRAIN` defines eleven independent floor/ceiling profiles in 1,200-unit architectural sections: launch terraces, a split-level gallery, a compression chamber, a sawtooth causeway, a high vault, cantilever docks, a cathedral concourse, and a stepped transit hall. Three additional sections—Lunar Bowls, Orbital Domes, and Wave Garden—use circular caps with tangent-matched ends. Existing slopes use cosine easing instead of straight-line interpolation, so the runner banks smoothly through joins. These profiles describe landing heights, not solid enclosing walls. Thin floating decks rise, drop, and terrace independently above and below the player. `terrainAt()` and `terrainVertices()` supply shared geometry to physics and rendering, sampled every 4 world units on a fixed grid; the player stays grounded on ramps and can flip away immediately. Obstacles and collectibles attach to the local contours. `boundsAt()` conservatively clears the circular hitbox across slope joins. `maxTunnelHeight` (490) bounds the worst crossing time used for fair spacing.

Difficulty combines the **63% faster initial pace**, a smooth distance-based speed ramp over 2,200 m, varying passage widths/elevations, gradual removal of extra spacing, and progressively more complex randomized hazard sequences. The cap is 420 units/s. The live PACE readout shows speed relative to the new starting pace. Power-ups are never required to survive.

Four architecture stages change the scene as distance grows:

| Area | Starts | Architecture |
| --- | --- | --- |
| Skyport terraces | 0 m | Floating launch decks, distant landing towers, first chasms |
| Suspended foundry | 220 m | Crane rigs, hanging machinery, striped industrial platforms |
| Fractured skybridges | 520 m | Broken viaducts, narrow trusses, detached overhead islands and moving hazards |
| Orbital reactor | 920 m | Segmented reactor rings, service decks, faster pistons and alternating routes |

Only bright landing edges and coral hazards belong to the playable foreground. Muted distant structures leave the open space above and below readable.

`SECTORS` controls these architecture stages. `themeAt()` applies smoothstep interpolation to sky colors, accent lighting, platform materials and thickness, and the planet radius; distant scenery and platform markings crossfade together. Transitions follow traveled distance, so pausing freezes them and slowing time stretches them naturally. Bright safe edges and coral hazard colors retain their meaning throughout. `OBSTACLE_POOL` unlocks designed hazards by area. After the safe floor-then-ceiling hazard introduction and one floor/overhead gap each, a seeded weighted generator chooses each obstacle individually, discourages immediate repeats, and randomizes widths, heights, gaps, motion phases, and motion rates. Already visible obstacles never change. Gap-defining obstacles are retained for 800 units behind the player, exceeding the widest camera’s rear reach plus the trailing platform break; passed holes therefore stay open until offscreen, including after a resize. Each Retry uses a fresh seed.

`difficultyAt()` increases threat level every 300 m, up to level 8. Intensity increases smoothly through 2,080 m: extra spacing falls from roughly 150–285 units toward 0–25 units, surface changes become more frequent, and machinery appears more often and moves faster. Geometry is clamped to leave a safe lane even inside the narrowest terrain. The 434-unit minimum gap is never reduced. The existing speed ramp still rises from 285 to 420; obstacle intensity reaches its cap at 2,080 m and speed finishes ramping at 2,200 m.

`surfaceOpenings()` defines real missing spans, shared by simulation and rendering. `platformSpans()` cuts decks into disconnected islands. Standalone gaps grow from 210–280 units to 300–370 with difficulty. Short breaks around hazard islands leave the opposite lane intact; gaps never overlap on both sides. Flip Rush groups preserve the same minimum gap while reducing additional breathing room to one quarter between their alternating hurdles. Three-hurdle groups grow to four above 55% intensity. Group rewards are separate from picked-up stars and bank with milestone rewards, once per run. The safe route is independent of power-ups, and nothing clamps the player to an absent deck. A missed transfer ends the run when the player exits above −70 or below 670 logical units.

Gear domes add large circular barriers on either surface. Orbit arrays place three continuously orbiting hazards around a hub; pendulums sweep through a clearly drawn arc. These unlock progressively, enter alternating Flip Rush groups, and preserve an opposite safe lane during every motion phase. Their circular outlines use the same radii and positions as `circles()` collision geometry. Guide lines show motion paths and are not hazards; coral circular bodies are hazardous. Mechanical movement remains active under reduced motion because it affects gameplay, while decorative rotation stops.

Four-pillar comb hurdles unlock in the foundry, with varied heights and amber tips; paired crushers unlock at the skybridges, extend in opposite phases, and show their maximum reach on dashed guide rails. Both types occur on the floor and overhead. Late runs favor alternating sides more strongly and remove extra breathing room sooner, without reducing the minimum crossing budget. Towers force an upper or lower route. Suspended decks and arches allow either side. Pistons telegraph their full extension with guide rails and always leave the opposite surface safe. Moving drifters stay in the center; a bounded absence counter prevents them disappearing from long random runs. A power-up appears every fourth obstacle beginning with the third, rotating Shield → Magnet → Slow → Overdrive → Gold Rush. Blue cargo drones appear before every other obstacle from the third onward; they are optional targets and cannot damage the runner. All architecture uses the same geometry for rendering and collision, and generation preserves an opposite landing lane through every challenge.

`minimumGap()` derives spacing from maximum horizontal speed × (maximum surface-crossing time + reaction budget), plus the player diameter and padding. Current minimum gap is 434 units, worst-case crossing time about 0.414 seconds. At the narrowest logical width of 600, obstacles are visible for over 1.02 seconds at maximum speed. The camera changes with viewport size but never changes simulation geometry or obstacle positions relative to the player. Rerun the fairness tests after adjusting tuning, particularly speed, gravity, radius, or terrain bounds.

## Verification

```sh
npm test
# Optional browser test tooling (not required to play):
npm install
npm run test:browser
```

The browser suite uses installed Google Chrome with Playwright and a fixed test seed for reliable visual coverage; normal gameplay uses a fresh random seed each run. It uses an isolated browser profile, starts its own test server on port 5197, and closes both on completion. Screenshots go in ignored `artifacts/`.

- Physics and animation: distance-based acceleration and speed cap, directional tilt, inverted ceiling landings, planted soles, alternating legs, reduced-motion poses, independently shaped rails and continuous joins, grounded ramp/terrace following, visible intermediate magnet trajectories, safe floor/ceiling landing, immediate velocity reversal, equal simulation at 30/60/120/144 FPS, triangle/circle and moving-hazard collisions, runway and visibility budget, five-minute safe-route simulations for 24 seeds with all pickups removed, three-minute simulations over 12 seeds at three different reaction timings, gap/void physics, persistent rear-camera gaps and bounded cleanup, rush escalation and one-time clean-clear rewards, platform rendering-support agreement, rectangle collisions through every piston/crusher phase and comb pillar, continuous palette and geometry blending across boundaries, tangent-continuous curved decks and subpixel rendering agreement, circle collisions and safe lanes through every orbit/pendulum phase, shield consumption, magnet targeting, slowdown expiry, chain/milestone accounting, reachable stars, one-time close-call rewards, save validation, reproducible randomness, and statistical early/late difficulty checks across 300 seeds.
- Browser: mouse, keyboard and emulated touch; duplicate-event prevention; menu isolation; pause/resume/Home/Retry; crash guard; best marker; preferences and cosmetic saves; invalid/unavailable storage; reduced motion; visibility pause; DPR 3; resize; desktop, portrait, small phone, and landscape layouts; enlarged scrollable home menus; console/runtime errors; an 85-second input-driven flight through all four areas collecting all five powers, pause-frozen power timers, reward persistence, both gap directions, continuous forward facing, crash/retry after a missed floor gap, held-key firing, simultaneous two-finger firing/flipping, pause-safe projectile and weapon state, a 65-second combat run, Overdrive projectiles, saved bounties, and offline audio rendering for finite, non-clipping samples.

Touch is browser-emulated, not a physical-device test. The visibility callback is tested by dispatching a visibility event with the hidden state set in the test. Audio is synthesized after user interaction; audible output is not assessed by headless tests.

Duel files: `duel-engine.js` owns the two-player simulation (shared by browser and server), `duel.js`/`duel.html`/`duel.css` own the duel page, `rig.js` draws the pilots for both modes, and `server.cjs` serves files and online rooms. `npm test` includes `tests/duel.test.cjs` (curve spacing in every arena, a new arena each round, curve following and slope push, deck movement and voids, ballistic aim under both gravities, ammo and refills, cover and rail piercing, asteroid bounces, manual shields and parries, each of the five powers, boomerangs, rings, rounds and overtime, and a 30-seed check that no stretch blocks all three decks and no floating object touches a running pilot) and `tests/duel-server.test.cjs` (static file privacy, host/join/stream/input/rematch, replay-safe input counters, forged tokens, disconnect pause, malformed and oversized bodies).

Files: `engine.js` owns simulation, projectile combat, rewards, and save validation; `audio.js` owns layered synthesis and voice cleanup; `motion.js` owns cosmetic tilt, stride, and joint poses; `game.js` owns rendering, input, audio triggers, persistence and lifecycle; `style.css` owns responsive screens. `GravityFlip.snapshot()` exposes read-only diagnostic copies. `GravityFlip.dispose()` cancels the animation, removes registered listeners, and closes audio for embedding teardown. The pagehide/pageshow handlers suspend and restore rendering safely for browser back/forward caching.
