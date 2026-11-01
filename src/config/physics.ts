import { z } from "zod";

import raw from "../../data/physics-config.json";
import { loadConfig } from "./load";

const positive = z.number().positive();
const nonNegative = z.number().nonnegative();
const ratio = z.number().min(0.1).max(2);
const positiveInt = z.number().int().positive();

/**
 * Constellation physics. Every unit is explicit: lengths in CSS px of the
 * world, times in seconds, stiffness in s⁻² (unit mass), damping as a ratio of
 * critical damping. See docs/FISICA.md for the intent of each parameter.
 */
export const physicsSchema = z
  .strictObject({
    version: z.string().min(1),
    integration: z.strictObject({
      /** Fixed simulation rate; render interpolates between steps. */
      stepHz: z.number().int().min(30).max(480),
      /** Spiral-of-death guard: extra time is dropped, not simulated. */
      maxStepsPerFrame: positiveInt,
      /** Frame deltas above this (tab switch, debugger) are clamped. */
      maxFrameSeconds: positive,
    }),
    bodies: z.strictObject({
      selfRadius: positive,
      /** Collision radius of a real match: half the sprite support. */
      matchRadius: positive,
      ghostRadius: positive,
      /** Free space guaranteed between two supports (δ). */
      clearance: positive,
      /** Display radius = base + similarity · scale (sprite size only). */
      matchDisplayBase: positive,
      matchDisplayScale: nonNegative,
    }),
    orbit: z.strictObject({
      minRadius: positive,
      radiusRatio: z.number().min(0.1).max(0.5),
      gamma: z.number().min(0.5).max(3),
    }),
    edges: z.strictObject({
      minDistance: positive,
      maxDistance: positive,
      stiffnessMin: nonNegative,
      stiffnessMax: nonNegative,
      dampingRatio: ratio,
      /** Constellation lines per star towards its nearest compatible neighbours. */
      linksPerNode: z.number().int().min(0).max(6),
    }),
    home: z.strictObject({
      stiffness: positive,
      ghostStiffness: positive,
      dampingRatio: ratio,
    }),
    collision: z.strictObject({
      stiffness: positive,
      /** The repulsive ramp starts this far before contact. */
      softMargin: positive,
      dampingRatio: z.number().min(0).max(2),
      projectionIterations: positiveInt,
    }),
    gravity: z.strictObject({ strength: nonNegative }),
    group: z.strictObject({
      strength: nonNegative,
      /** Clique search only looks at each star's strongest neighbours (top-K). */
      neighbourCap: z.number().int().min(2),
      maxSize: z.number().int().min(3),
      maxGroups: z.number().int().nonnegative(),
      /** Angular spacing between group members, in contact diameters. */
      sectorSpacing: z.number().min(1).max(3),
    }),
    air: z.strictObject({ damping: nonNegative }),
    bounds: z.strictObject({
      padding: positive,
      /** Hard clamp sits this far outside the soft wall. */
      hardMargin: nonNegative,
      stiffness: positive,
      dampingRatio: ratio,
    }),
    limits: z.strictObject({ maxSpeed: positive }),
    sleep: z.strictObject({
      /** Total kinetic energy ½Σv² (px²/s²) below which the sky may sleep. */
      kineticThreshold: positive,
      seconds: positive,
    }),
    ambient: z.strictObject({
      driftAmplitude: nonNegative,
      driftHz: positive,
      breatheScale: z.number().min(0).max(0.05),
      breathePeriodSeconds: positive,
      /** Once asleep only drift is painted, every N-th display frame. */
      idleFrameDivider: positiveInt,
    }),
    interaction: z.strictObject({
      anchorStiffness: positive,
      anchorDampingRatio: ratio,
      throwWindowMs: positive,
      maxThrowSpeed: positive,
      tapSlopPx: positive,
      /** Impulse used by the dev "drag agresivo" scenario. */
      kickSpeed: positive,
    }),
    camera: z.strictObject({
      minZoom: positive,
      maxZoom: positive,
      followRate: positive,
      recenterRate: positive,
      wheelSensitivity: positive,
    }),
    bonds: z.strictObject({
      joinFactor: z.number().min(1).max(2),
      breakFactor: z.number().min(1).max(3),
      traceSeconds: positive,
      fadeSeconds: positive,
      flashSeconds: positive,
      leanPx: nonNegative,
      happySeconds: positive,
      groupTraceSeconds: positive,
    }),
    transition: z.strictObject({ fadeSeconds: positive }),
    scene: z.strictObject({
      maxRealMatches: positiveInt,
      defaultGhosts: z.number().int().nonnegative(),
      maxGhosts: z.number().int().nonnegative(),
      /** Upper bound for the offline (reduced-motion) settle. */
      settleSeconds: positive,
      /** Ghost home ring, as fractions of the viewport's shorter side. */
      ghostOrbitMin: z.number().min(0).max(1),
      ghostOrbitSpan: z.number().min(0).max(1),
      ghostAngleJitter: nonNegative,
      /** Above this many stars glows drop the dither pattern (paint budget). */
      denseSkyStars: positiveInt,
    }),
  })
  .refine((c) => c.edges.minDistance < c.edges.maxDistance, {
    message: "edges.minDistance must be below edges.maxDistance",
  })
  .refine((c) => c.edges.stiffnessMin <= c.edges.stiffnessMax, {
    message: "edges.stiffnessMin must not exceed edges.stiffnessMax",
  })
  .refine((c) => c.camera.minZoom < 1 && c.camera.maxZoom > 1, {
    message: "camera zoom limits must bracket 1",
  })
  .refine((c) => c.bonds.joinFactor < c.bonds.breakFactor, {
    message: "bonds.joinFactor must be below bonds.breakFactor (hysteresis)",
  })
  // The hard clamp must keep the whole sprite support inside the viewport.
  .refine(
    (c) => c.bounds.padding - c.bounds.hardMargin >= Math.max(c.bodies.selfRadius, c.bodies.matchRadius),
    { message: "bounds.padding - bounds.hardMargin must cover the largest body radius" },
  )
  .refine((c) => c.scene.defaultGhosts <= c.scene.maxGhosts, {
    message: "scene.defaultGhosts must not exceed scene.maxGhosts",
  })
  // Drift and lean are per-star render offsets. Two neighbours moving towards
  // each other must still keep their supports apart, so both offsets together
  // must fit inside the clearance cushion δ. (Breathing is a uniform camera
  // scale, which never changes who overlaps whom.)
  .refine((c) => 2 * (c.ambient.driftAmplitude + c.bonds.leanPx) < c.bodies.clearance, {
    message: "2·(ambient.driftAmplitude + bonds.leanPx) must stay below bodies.clearance",
  })
  // Explicit-integration stability: ω·dt < 1 for the stiffest spring keeps
  // semi-implicit Euler well inside its stability region (ω·dt < 2).
  .refine(
    (c) =>
      // The collision ramp F = k·m·s² is 2k stiff at contact.
      Math.sqrt(Math.max(2 * c.collision.stiffness, c.interaction.anchorStiffness, c.bounds.stiffness)) /
        c.integration.stepHz <
      1,
    { message: "stiffest spring is unstable at integration.stepHz (needs √k / stepHz < 1)" },
  );

export type PhysicsConfig = z.output<typeof physicsSchema>;

export const PHYSICS: Readonly<PhysicsConfig> = loadConfig("physics-config", physicsSchema, raw);
