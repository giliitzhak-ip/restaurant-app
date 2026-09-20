import type { CSSProperties } from "react";
import type { LedPath, LightingFixture } from "@/types/scene";

/**
 * Turning a light into pixels.
 *
 * Everything here produces CSS rather than pixel work, and that is the whole
 * performance strategy: a glow is a blurred gradient in a compositor layer,
 * so dragging a light is a transform the GPU already knows how to do. The
 * per-pixel renderer that paints the cladding runs once per change; the
 * lighting never touches it.
 *
 * `mix-blend-mode: screen` is what makes it read as light rather than as a
 * coloured shape: screen can only brighten, so a glow over dark cladding
 * lifts it and a glow over a white wall barely shows — which is what actually
 * happens in a room.
 *
 * None of this is photometry. It is a convincing picture of light, and the
 * disclaimer on every view that shows it says so.
 */

/**
 * Colour temperature to RGB.
 *
 * Tanner Helland's piecewise fit to the blackbody curve, which is the one
 * everyone uses for this: cheap, stable, and visually right across the range
 * of white light people actually buy. Clamped to 2200–6500K because outside
 * that the approximation drifts and nobody sells the result.
 */
export function kelvinToRgb(kelvin: number): [number, number, number] {
  const temp = Math.min(6500, Math.max(2200, kelvin)) / 100;

  const red =
    temp <= 66
      ? 255
      : 329.698727446 * Math.pow(temp - 60, -0.1332047592);

  const green =
    temp <= 66
      ? 99.4708025861 * Math.log(temp) - 161.1195681661
      : 288.1221695283 * Math.pow(temp - 60, -0.0755148492);

  const blue =
    temp >= 66
      ? 255
      : temp <= 19
        ? 0
        : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;

  const clamp = (value: number) => Math.min(255, Math.max(0, Math.round(value)));
  return [clamp(red), clamp(green), clamp(blue)];
}

export function kelvinToHex(kelvin: number) {
  const [r, g, b] = kelvinToRgb(kelvin);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** The emitted colour, whichever mode the light is in. */
export function lightColor(light: Pick<LightingFixture, "colorMode" | "color" | "temperatureK">) {
  return light.colorMode === "RGB" ? light.color : kelvinToHex(light.temperatureK);
}

function rgbaFromHex(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * How wide a light spills, in multiples of its own size.
 *
 * `spread` at 0 is the emitter and almost nothing else — a recessed profile
 * seen edge-on. At 1 it is a wash across the wall. The blur is expressed as a
 * percentage of the stage rather than pixels, so a design looks the same at
 * preview size and at download size.
 */
export function fixtureStyle(
  fixture: LightingFixture,
  stageWidthPx: number,
): CSSProperties {
  const color = lightColor(fixture);
  const reach = 0.25 + fixture.spread * 0.75;
  const blurPx = Math.max(2, fixture.blur * 0.06 * stageWidthPx);

  /*
   * An elliptical gradient rather than a circular one: a strip behind a
   * television is three times wider than it is tall, and a circular falloff
   * on it produces a ball of light in the middle with dark ends.
   */
  const inner = rgbaFromHex(color, Math.min(1, fixture.intensity));
  const mid = rgbaFromHex(color, fixture.intensity * 0.45);

  return {
    background: `radial-gradient(ellipse ${(reach * 100).toFixed(0)}% ${(reach * 100).toFixed(0)}% at 50% 50%, ${inner} 0%, ${mid} 45%, transparent 78%)`,
    filter: `blur(${blurPx.toFixed(1)}px)`,
    mixBlendMode: "screen",
    opacity: fixture.enabled ? 1 : 0,
    transform: `rotate(${fixture.direction}deg)`,
  };
}

/**
 * A drawn run: a bright core with a soft halo around it.
 *
 * Two strokes rather than one. A single blurred stroke loses the line itself
 * and looks like fog; a single sharp stroke looks like a drawn line rather
 * than a light. The core carries the shape, the halo carries the glow.
 */
export function pathStrokes(path: LedPath, stageWidthPx: number) {
  const color = lightColor(path);
  const corePx = Math.max(1, path.thickness * stageWidthPx);
  const haloPx = corePx * (2 + path.spread * 8);
  return {
    color,
    core: {
      stroke: rgbaFromHex(color, Math.min(1, 0.55 + path.intensity * 0.45)),
      strokeWidth: corePx,
    },
    halo: {
      stroke: rgbaFromHex(color, path.intensity * 0.5),
      strokeWidth: haloPx,
      filter: `blur(${Math.max(1, path.blur * 0.035 * stageWidthPx).toFixed(1)}px)`,
    },
  };
}

/** `M x y L x y …` in stage percentages, for an SVG with a 0..100 viewBox. */
export function pathD(path: LedPath) {
  if (!path.points.length) return "";
  const [first, ...rest] = path.points;
  const d = [`M ${(first!.x * 100).toFixed(3)} ${(first!.y * 100).toFixed(3)}`];
  for (const point of rest) {
    d.push(`L ${(point.x * 100).toFixed(3)} ${(point.y * 100).toFixed(3)}`);
  }
  if (path.closed) d.push("Z");
  return d.join(" ");
}

/**
 * The shadow an object throws from a light behind it.
 *
 * Deliberately crude, and deliberately only for hidden light. A strip behind
 * a television does not light the room evenly — it darkens the object's own
 * silhouette against the halo, and that contrast is most of what sells the
 * effect. Computing real shadows from a photograph whose geometry we do not
 * know would be inventing information.
 */
export function objectShadowFilter(hasHiddenLightBehind: boolean) {
  return hasHiddenLightBehind
    ? "drop-shadow(0 0 6px rgba(0,0,0,0.55)) drop-shadow(0 2px 3px rgba(0,0,0,0.35))"
    : "drop-shadow(0 2px 4px rgba(0,0,0,0.28))";
}
