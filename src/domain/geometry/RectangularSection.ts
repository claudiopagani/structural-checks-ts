import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import { CrossSection, type SectionMetadata } from "./CrossSection.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" }) satisfies UnitSystem;

export interface RectangularSectionOptions {
  width: number;
  height: number;
  id?: string | null;
  name?: string | null;
  units?: UnitSystemInput | null;
  metadata?: SectionMetadata;
}

export class RectangularSection extends CrossSection {
  constructor({
    width,
    height,
    id = null,
    name = null,
    units = null,
    metadata = {},
  }: RectangularSectionOptions) {
    assertExplicitUnitSystem(units, "RectangularSection");
    const unitResolver = createUnitResolver(units, INTERNAL_UNITS);
    const resolvedWidth = unitResolver.length(width);
    const resolvedHeight = unitResolver.length(height);

    if (!Number.isFinite(resolvedWidth) || resolvedWidth <= 0) {
      throw new Error("A positive rectangular section width is required.");
    }

    if (!Number.isFinite(resolvedHeight) || resolvedHeight <= 0) {
      throw new Error("A positive rectangular section height is required.");
    }

    const area = resolvedWidth * resolvedHeight;
    const inertiaY = (resolvedWidth * resolvedHeight ** 3) / 12;
    const inertiaZ = (resolvedHeight * resolvedWidth ** 3) / 12;

    super({
      id,
      name: name ?? `Rectangular ${resolvedWidth}x${resolvedHeight}`,
      area,
      centroidY: resolvedHeight / 2,
      centroidZ: resolvedWidth / 2,
      inertiaY,
      inertiaZ,
      elasticSectionModulusY: inertiaY / (resolvedHeight / 2),
      elasticSectionModulusZ: inertiaZ / (resolvedWidth / 2),
      height: resolvedHeight,
      width: resolvedWidth,
      units: INTERNAL_UNITS,
      outlinePoints: [
        { y: 0, z: 0 },
        { y: 0, z: resolvedWidth },
        { y: resolvedHeight, z: resolvedWidth },
        { y: resolvedHeight, z: 0 },
      ],
      metadata: {
        ...metadata,
        shape: "rectangular",
        unitSystem: INTERNAL_UNITS,
        sourceUnitSystem: metadata.sourceUnitSystem ?? unitResolver.sourceUnitSystem,
      },
    });
  }
}
