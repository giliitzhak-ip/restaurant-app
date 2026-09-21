"use client";

import * as React from "react";
import { realFromSize, type PhotoFrame } from "../scene/factory";
import type { SurfaceKind } from "@/types/design";
import type { DesignScene } from "@/types/scene";

/** The three surfaces, named the way the rest of the UI names them. */
export function surfaceLabel(kind: SurfaceKind): string {
  return kind === "FLOOR" ? "רצפה" : kind === "WALL" ? "קיר" : "תקרה";
}

/**
 * The design, in words.
 *
 * The room designer's output is a picture, and a picture is not available to
 * everyone. This renders the same information as prose and a list: which
 * surfaces carry which cladding, what is on the wall, where it sits, how big
 * it is, and what the lighting is set to.
 *
 * It is not a caption and it is not `alt` text — those would have to be one
 * sentence. It is a parallel representation of the whole scene, and it is
 * visible to everyone rather than hidden behind `sr-only`: someone checking
 * measurements before ordering wants to read it too.
 */
export function DesignSummary({
  scene,
  frame,
  surfaces,
  className,
}: {
  scene: DesignScene;
  frame: PhotoFrame;
  /** Cladding choices, already resolved to product names by the caller. */
  surfaces: { label: string; productName: string | null; areaSqm: number | null }[];
  className?: string;
}) {
  const headingId = React.useId();

  const objects = React.useMemo(
    () =>
      [...scene.objects]
        .sort((a, b) => a.layerIndex - b.layerIndex)
        .map((object) => {
          const real = realFromSize(object.width, object.height, frame);
          return {
            id: object.id,
            label: object.label,
            /* Horizontal position read the way a person in the room would say
               it, not as a raw percentage. */
            where: describePosition(object.position.x, object.position.y),
            size: `${real.widthCm}×${real.heightCm} ס״מ`,
            rotation: Math.round(object.rotation),
            sellable: Boolean(object.productId),
            hidden: !object.visible,
          };
        }),
    [scene.objects, frame],
  );

  const fixtures = React.useMemo(
    () =>
      scene.lightingFixtures.map((fixture) => ({
        id: fixture.id,
        label: fixture.label,
        where: describePosition(fixture.position.x, fixture.position.y),
        temperature:
          fixture.colorMode === "RGB"
            ? `צבע ${fixture.color}`
            : `${Math.round(fixture.temperatureK)}K`,
        intensity: `${Math.round(fixture.intensity * 100)}%`,
        placement: fixture.placement === "HIDDEN" ? "מוסתר, מאיר בעקיפין" : "אור קדמי",
      })),
    [scene.lightingFixtures],
  );

  const chosenSurfaces = surfaces.filter((surface) => surface.productName);
  const empty = !chosenSurfaces.length && !objects.length && !fixtures.length;

  return (
    <section aria-labelledby={headingId} className={className}>
      <h3 id={headingId} className="text-sm font-medium">
        סיכום העיצוב בכתב
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        תיאור מילולי של מה שמוצג בהדמיה, כחלופה לתמונה.
      </p>

      {empty ? (
        <p className="mt-3 text-xs text-muted">
          עדיין לא נבחרו חיפויים ולא נוספו פריטים.
        </p>
      ) : (
        <div className="mt-3 space-y-4 text-xs leading-relaxed">
          {chosenSurfaces.length ? (
            <div>
              <h4 className="font-medium text-ink-soft">חיפויים ומשטחים</h4>
              <ul className="mt-1 space-y-1 ps-4">
                {chosenSurfaces.map((surface) => (
                  <li key={surface.label} className="list-disc text-muted">
                    {surface.label}: {surface.productName}
                    {surface.areaSqm
                      ? ` · ${surface.areaSqm.toFixed(2)} מ״ר`
                      : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {objects.length ? (
            <div>
              <h4 className="font-medium text-ink-soft">
                פריטים בחדר ({objects.length})
              </h4>
              <ul className="mt-1 space-y-1 ps-4">
                {objects.map((object) => (
                  <li key={object.id} className="list-disc text-muted">
                    {object.label} — {object.where}, {object.size}
                    {object.rotation ? `, בזווית ${object.rotation}°` : ""}
                    {object.hidden ? " (מוסתר כרגע)" : ""}
                    {object.sellable ? "" : " · להמחשה בלבד, אינו נמכר באתר"}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {fixtures.length ? (
            <div>
              <h4 className="font-medium text-ink-soft">
                תאורה ({fixtures.length})
              </h4>
              <ul className="mt-1 space-y-1 ps-4">
                {fixtures.map((fixture) => (
                  <li key={fixture.id} className="list-disc text-muted">
                    {fixture.label} — {fixture.where}, {fixture.temperature}, עוצמה{" "}
                    {fixture.intensity}, {fixture.placement}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

/**
 * A position, in words.
 *
 * "34% אופקית" is accurate and useless. A person describing a room says "on
 * the right, at mid height", so that is what this returns — with the RTL
 * reading in mind: x = 0 is the left edge of the photograph.
 */
function describePosition(x: number, y: number): string {
  const horizontal = x < 0.33 ? "בצד שמאל" : x > 0.67 ? "בצד ימין" : "במרכז";
  const vertical = y < 0.33 ? "בחלק העליון" : y > 0.67 ? "בחלק התחתון" : "בגובה אמצעי";
  return `${horizontal}, ${vertical}`;
}
