# Leg 1 — Tuscan Hills (prototype)

First playable slice for the Mille Miglia pilgrimage game. One stretch of hill road,
one car, two cameras. Built with Three.js + Vite.

```
npm install
npm run dev
```

`W`/`S` throttle and brake · `A`/`D` steer · `C` chase ⇄ cockpit · `R` restart

## What this prototype is for

It is not a vertical slice. It exists to answer the two questions that actually
carry risk:

1. **Does driving a slow, soft, unglamorous car feel contemplative rather than
   boring?** That is the whole game. The car tops out around 113 km/h, the rack is
   slow, and the body wallows on deliberately under-damped springs. The speed cap is
   characterisation, not a limitation.
2. **Can eight legs be authored without hand-modelling eight levels?** A leg here is
   *data* — a spline, an elevation rule, a scatter ruleset, a palette — not a built
   scene. Everything below follows from that.

## The road is the timeline

`RoadPath` is addressed by **distance along the road in metres**, not by spline
parameter `t`. That is the load-bearing decision in the whole prototype: it means
story beats, scatter rules and audio cues can be authored as "at 640 m" and stay put
when the spline is reshaped. `BEATS` in `src/main.js` demonstrates it — four lines of
dialogue pinned to distances, firing as you drive past them.

The cross-section in `ROAD_PROFILE` is shared by the mesh builder and the physics
ground query, so the car drives on exactly the surface that is drawn.

## The car

Non-branded, assembled in code from a side profile rather than authored as an asset,
so every proportion stays tweakable while the design is still being decided.

The era's design language, borrowed generally rather than from one make: dead-flat
slab sides, a hard crease low on the door, circular door handles, circular extractor
vents, circular cut-outs in the hubcaps, and a grey plastic band running
bumper-to-bumper through the rocker. The face is deliberately *not* the reference
car's — a plain full-width slot with rectangular lamps.

Twenty years of weather are baked into vertex colours: upward-facing panels chalk out
while vertical ones keep their paint, so roof, hood and boot lid are visibly bleached
against the flanks. The driver's door is a slightly different colour — replaced once,
resprayed, never quite matched. Dad's roof rack is still on it.

The odometer starts at **187,432 km**. The brothers are adding to a number he started;
the trip meter beside it was reset when they left.

## Layout

```
src/
  main.js              scene assembly, input, HUD, story beats
  world/road.js        arc-length spline, cross-section, ribbon + centre line
  world/terrain.js     heightfield with the road graded in, distant ridges
  world/scatter.js     cypress rows, pines, scrub, farmhouses — as rules
  world/noise.js       deterministic value noise / fbm
  car/buildCar.js      parametric body from a side profile
  car/interior.js      cabin, live instrument cluster, odometer
  car/vehicle.js       kinematic bicycle model + visual body springs
  camera/cameras.js    chase and cockpit, with a blend between them
  render/toon.js       quantised light ramp, palette, sky, lighting
```

`window.__dbg` exposes the scene, road, terrain and vehicle for poking from the console.

## Known limitations

- No outline pass and no 1957 dither shader yet — the toon ramp is a placeholder for
  the real two-style pipeline.
- Terrain is generated once at load (~1 s) and never streamed; fine for one leg,
  not for eight.
- The cabin has no door-open state, no found-object interaction, and no radio
  behaviour beyond the head unit being modelled.
- Off-road handling is crude: reduced grip and more rolling resistance, nothing more.
- Scatter is placed but never culled by distance; it will need LODs at eight-leg scale.
