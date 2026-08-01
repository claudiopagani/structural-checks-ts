const EPS = 1e-9;

export interface FootingPlanPoint {
  x: number;
  y: number;
}

export interface FootingPressurePolynomial {
  intercept: number;
  gradientX: number;
  gradientY: number;
}

export interface RectangularFootingContactInput {
  widthX?: number;
  widthY?: number;
  nEd?: number;
  mxEd?: number;
  myEd?: number;
}

export interface RectangularFootingContactResult extends Record<string, unknown> {
  status: string;
  contactType: string;
  widthX: number;
  widthY: number;
  area: number;
  contactArea?: number | null;
  nEd: number;
  mxEd: number;
  myEd: number;
  eccentricityX: number | null;
  eccentricityY: number | null;
  kernUtilizationX?: number;
  kernUtilizationY?: number;
  equilibriumUtilization?: number;
  minimumPressure: number | null;
  maximumPressure: number | null;
  elasticMinimumPressure?: number;
  elasticMaximumPressure?: number;
  corners: Array<FootingPlanPoint & { id: string; pressure: number }>;
  pressurePolynomial: FootingPressurePolynomial | null;
  partialContact: Record<string, unknown> | null;
}

function positive(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive.`);
  }
  return value;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be finite.`);
  }
  return value;
}

function cornerPressures({
  widthX,
  widthY,
  meanPressure,
  gradientX,
  gradientY,
}: {
  widthX: number;
  widthY: number;
  meanPressure: number;
  gradientX: number;
  gradientY: number;
}) {
  return [
    { id: "x-minus-y-minus", x: -widthX / 2, y: -widthY / 2 },
    { id: "x-plus-y-minus", x: widthX / 2, y: -widthY / 2 },
    { id: "x-plus-y-plus", x: widthX / 2, y: widthY / 2 },
    { id: "x-minus-y-plus", x: -widthX / 2, y: widthY / 2 },
  ].map((corner) => ({
    ...corner,
    pressure: meanPressure + gradientX * corner.x + gradientY * corner.y,
  }));
}

function pressureAt(point: FootingPlanPoint, polynomial: FootingPressurePolynomial): number {
  return polynomial.intercept + polynomial.gradientX * point.x + polynomial.gradientY * point.y;
}

function clipCompressionPolygon(
  polygon: FootingPlanPoint[],
  polynomial: FootingPressurePolynomial,
  tolerance = 1e-10,
): FootingPlanPoint[] {
  const output: FootingPlanPoint[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index] as FootingPlanPoint;
    const end = polygon[(index + 1) % polygon.length] as FootingPlanPoint;
    const startPressure = pressureAt(start, polynomial);
    const endPressure = pressureAt(end, polynomial);
    const startInside = startPressure >= -tolerance;
    const endInside = endPressure >= -tolerance;
    if (startInside) output.push({ ...start });
    if (startInside !== endInside) {
      const denominator = startPressure - endPressure;
      const ratio = Math.abs(denominator) > EPS ? startPressure / denominator : 0;
      output.push({
        x: start.x + ratio * (end.x - start.x),
        y: start.y + ratio * (end.y - start.y),
      });
    }
  }
  return output;
}

interface PolygonMoments {
  area: number;
  sx: number;
  sy: number;
  ixx: number;
  iyy: number;
  ixy: number;
}

function polygonMoments(polygon: FootingPlanPoint[]): PolygonMoments {
  if (polygon.length < 3) {
    return { area: 0, sx: 0, sy: 0, ixx: 0, iyy: 0, ixy: 0 };
  }
  let area2 = 0;
  let sx6 = 0;
  let sy6 = 0;
  let ixx12 = 0;
  let iyy12 = 0;
  let ixy24 = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index] as FootingPlanPoint;
    const b = polygon[(index + 1) % polygon.length] as FootingPlanPoint;
    const cross = a.x * b.y - b.x * a.y;
    area2 += cross;
    sx6 += (a.x + b.x) * cross;
    sy6 += (a.y + b.y) * cross;
    ixx12 += (a.x ** 2 + a.x * b.x + b.x ** 2) * cross;
    iyy12 += (a.y ** 2 + a.y * b.y + b.y ** 2) * cross;
    ixy24 += (2 * a.x * a.y + a.x * b.y + b.x * a.y + 2 * b.x * b.y) * cross;
  }
  const sign = area2 >= 0 ? 1 : -1;
  return {
    area: (sign * area2) / 2,
    sx: (sign * sx6) / 6,
    sy: (sign * sy6) / 6,
    ixx: (sign * ixx12) / 12,
    iyy: (sign * iyy12) / 12,
    ixy: (sign * ixy24) / 24,
  };
}

function integratePlane(polynomial: FootingPressurePolynomial, moments: PolygonMoments) {
  return {
    force:
      polynomial.intercept * moments.area +
      polynomial.gradientX * moments.sx +
      polynomial.gradientY * moments.sy,
    momentY:
      polynomial.intercept * moments.sx +
      polynomial.gradientX * moments.ixx +
      polynomial.gradientY * moments.ixy,
    momentX:
      polynomial.intercept * moments.sy +
      polynomial.gradientX * moments.ixy +
      polynomial.gradientY * moments.iyy,
  };
}

function solve3x3(matrix: number[][], right: number[]): number[] | null {
  const augmented = matrix.map((row, index) => [...row, right[index] as number]);
  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (
        Math.abs(augmented[row]?.[column] as number) >
        Math.abs(augmented[pivot]?.[column] as number)
      ) {
        pivot = row;
      }
    }
    if (Math.abs(augmented[pivot]?.[column] as number) <= 1e-18) {
      return null;
    }
    [augmented[column], augmented[pivot]] = [
      augmented[pivot] as number[],
      augmented[column] as number[],
    ];
    const pivotRow = augmented[column] as number[];
    const divisor = pivotRow[column] as number;
    for (let item = column; item < 4; item += 1) {
      pivotRow[item] = (pivotRow[item] as number) / divisor;
    }
    for (let row = 0; row < 3; row += 1) {
      if (row === column) continue;
      const current = augmented[row] as number[];
      const multiplier = current[column] as number;
      for (let item = column; item < 4; item += 1) {
        current[item] = (current[item] as number) - multiplier * (pivotRow[item] as number);
      }
    }
  }
  return augmented.map((row) => row[3] as number);
}

interface BiaxialContactSolution {
  iteration: number;
  polygon: FootingPlanPoint[];
  moments: PolygonMoments;
  response: { force: number; momentY: number; momentX: number };
  residual: { n: number; my: number; mx: number };
  residualNorm: number;
  polynomial: FootingPressurePolynomial;
}

function solveBiaxialCompressionContact({
  widthX,
  widthY,
  nEd,
  mxEd,
  myEd,
  initialPolynomial,
  tolerance = 1e-10,
  maxIterations = 50,
}: {
  widthX: number;
  widthY: number;
  nEd: number;
  mxEd: number;
  myEd: number;
  initialPolynomial: FootingPressurePolynomial;
  tolerance?: number;
  maxIterations?: number;
}): BiaxialContactSolution | null {
  const base: FootingPlanPoint[] = [
    { x: -widthX / 2, y: -widthY / 2 },
    { x: widthX / 2, y: -widthY / 2 },
    { x: widthX / 2, y: widthY / 2 },
    { x: -widthX / 2, y: widthY / 2 },
  ];
  const scale = Math.max(Math.abs(nEd), Math.abs(mxEd) / widthY, Math.abs(myEd) / widthX, 1);
  let polynomial = { ...initialPolynomial };
  let last: Omit<BiaxialContactSolution, "polynomial"> | null = null;
  for (let iteration = 0; iteration <= maxIterations; iteration += 1) {
    const polygon = clipCompressionPolygon(base, polynomial);
    const moments = polygonMoments(polygon);
    if (moments.area <= EPS) return null;
    const response = integratePlane(polynomial, moments);
    const residual = {
      n: nEd - response.force,
      my: myEd - response.momentY,
      mx: mxEd - response.momentX,
    };
    const residualNorm =
      Math.max(
        Math.abs(residual.n),
        Math.abs(residual.my) / widthX,
        Math.abs(residual.mx) / widthY,
      ) / scale;
    last = {
      iteration,
      polygon,
      moments,
      response,
      residual,
      residualNorm,
    };
    if (residualNorm <= tolerance) break;
    const increment = solve3x3(
      [
        [moments.area, moments.sx, moments.sy],
        [moments.sx, moments.ixx, moments.ixy],
        [moments.sy, moments.ixy, moments.iyy],
      ],
      [residual.n, residual.my, residual.mx],
    );
    if (!increment) return null;
    polynomial = {
      intercept: polynomial.intercept + (increment[0] as number),
      gradientX: polynomial.gradientX + (increment[1] as number),
      gradientY: polynomial.gradientY + (increment[2] as number),
    };
  }
  return last != null && last.residualNorm <= tolerance ? { ...last, polynomial } : null;
}

function partialContact({
  axis,
  dimension,
  transverseDimension,
  eccentricity,
  nEd,
}: {
  axis: "x" | "y";
  dimension: number;
  transverseDimension: number;
  eccentricity: number;
  nEd: number;
}) {
  const side = Math.sign(eccentricity) || 1;
  const contactLength = 3 * (dimension / 2 - Math.abs(eccentricity));
  if (contactLength <= EPS) {
    return null;
  }
  const compressedEdge = (side * dimension) / 2;
  const zeroPressureEdge = compressedEdge - side * contactLength;
  const maximumPressure = (2 * nEd) / (contactLength * transverseDimension);
  const slope = (side * maximumPressure) / contactLength;
  const intercept = maximumPressure - slope * compressedEdge;
  return {
    axis,
    side: side > 0 ? "positive" : "negative",
    contactLength,
    contactArea: contactLength * transverseDimension,
    compressedEdge,
    zeroPressureEdge,
    maximumPressure,
    pressurePolynomial: {
      intercept,
      gradientX: axis === "x" ? slope : 0,
      gradientY: axis === "y" ? slope : 0,
    },
    activeInterval: {
      min: Math.min(compressedEdge, zeroPressureEdge),
      max: Math.max(compressedEdge, zeroPressureEdge),
    },
  };
}

export class RectangularFootingContactAnalysis {
  analyze({
    widthX,
    widthY,
    nEd,
    mxEd = 0,
    myEd = 0,
  }: RectangularFootingContactInput = {}): RectangularFootingContactResult {
    const bx = positive(widthX, "widthX");
    const by = positive(widthY, "widthY");
    const compression = finite(nEd, "nEd");
    const mx = finite(mxEd, "mxEd");
    const my = finite(myEd, "myEd");
    const area = bx * by;
    const inertiaX = (bx * by ** 3) / 12;
    const inertiaY = (by * bx ** 3) / 12;
    if (compression <= EPS) {
      return {
        status: "no-compressive-equilibrium",
        contactType: "none",
        widthX: bx,
        widthY: by,
        area,
        nEd: compression,
        mxEd: mx,
        myEd: my,
        eccentricityX: null,
        eccentricityY: null,
        minimumPressure: null,
        maximumPressure: null,
        corners: [],
        pressurePolynomial: null,
        partialContact: null,
      };
    }
    const eccentricityX = my / compression;
    const eccentricityY = mx / compression;
    const meanPressure = compression / area;
    const gradientX = my / inertiaY;
    const gradientY = mx / inertiaX;
    const corners = cornerPressures({
      widthX: bx,
      widthY: by,
      meanPressure,
      gradientX,
      gradientY,
    });
    const elasticMinimum = Math.min(...corners.map((corner) => corner.pressure));
    const elasticMaximum = Math.max(...corners.map((corner) => corner.pressure));
    const tolerance = Math.max(meanPressure, 1) * 1e-10;
    if (elasticMinimum >= -tolerance) {
      return {
        status: "ok",
        contactType: "full",
        widthX: bx,
        widthY: by,
        area,
        contactArea: area,
        nEd: compression,
        mxEd: mx,
        myEd: my,
        eccentricityX,
        eccentricityY,
        kernUtilizationX: (6 * Math.abs(eccentricityX)) / bx,
        kernUtilizationY: (6 * Math.abs(eccentricityY)) / by,
        equilibriumUtilization: Math.max(
          (2 * Math.abs(eccentricityX)) / bx,
          (2 * Math.abs(eccentricityY)) / by,
        ),
        minimumPressure: Math.max(0, elasticMinimum),
        maximumPressure: elasticMaximum,
        elasticMinimumPressure: elasticMinimum,
        elasticMaximumPressure: elasticMaximum,
        corners,
        pressurePolynomial: {
          intercept: meanPressure,
          gradientX,
          gradientY,
        },
        partialContact: null,
      };
    }
    const resultantOutside =
      Math.abs(eccentricityX) >= bx / 2 - EPS || Math.abs(eccentricityY) >= by / 2 - EPS;
    if (resultantOutside) {
      return {
        status: "no-compressive-equilibrium",
        contactType: "none",
        widthX: bx,
        widthY: by,
        area,
        nEd: compression,
        mxEd: mx,
        myEd: my,
        eccentricityX,
        eccentricityY,
        equilibriumUtilization: Math.max(
          (2 * Math.abs(eccentricityX)) / bx,
          (2 * Math.abs(eccentricityY)) / by,
        ),
        minimumPressure: null,
        maximumPressure: null,
        elasticMinimumPressure: elasticMinimum,
        elasticMaximumPressure: elasticMaximum,
        corners,
        pressurePolynomial: null,
        partialContact: null,
      };
    }
    const momentTolerance = Math.max(Math.abs(mx), Math.abs(my), 1) * 1e-10;
    const xOnly = Math.abs(mx) <= momentTolerance;
    const yOnly = Math.abs(my) <= momentTolerance;
    if (xOnly !== yOnly) {
      const axis = xOnly ? "x" : "y";
      const partial = partialContact({
        axis,
        dimension: axis === "x" ? bx : by,
        transverseDimension: axis === "x" ? by : bx,
        eccentricity: axis === "x" ? eccentricityX : eccentricityY,
        nEd: compression,
      });
      return {
        status: partial ? "ok" : "no-compressive-equilibrium",
        contactType: partial ? "partial-uniaxial" : "none",
        widthX: bx,
        widthY: by,
        area,
        contactArea: partial?.contactArea ?? null,
        nEd: compression,
        mxEd: mx,
        myEd: my,
        eccentricityX,
        eccentricityY,
        kernUtilizationX: (6 * Math.abs(eccentricityX)) / bx,
        kernUtilizationY: (6 * Math.abs(eccentricityY)) / by,
        equilibriumUtilization: Math.max(
          (2 * Math.abs(eccentricityX)) / bx,
          (2 * Math.abs(eccentricityY)) / by,
        ),
        minimumPressure: partial ? 0 : null,
        maximumPressure: partial?.maximumPressure ?? null,
        elasticMinimumPressure: elasticMinimum,
        elasticMaximumPressure: elasticMaximum,
        corners,
        pressurePolynomial: partial?.pressurePolynomial ?? null,
        partialContact: partial,
      };
    }
    const solved = solveBiaxialCompressionContact({
      widthX: bx,
      widthY: by,
      nEd: compression,
      mxEd: mx,
      myEd: my,
      initialPolynomial: {
        intercept: meanPressure,
        gradientX,
        gradientY,
      },
    });
    if (!solved) {
      return {
        status: "not-supported",
        contactType: "partial-biaxial",
        widthX: bx,
        widthY: by,
        area,
        nEd: compression,
        mxEd: mx,
        myEd: my,
        eccentricityX,
        eccentricityY,
        equilibriumUtilization: Math.max(
          (2 * Math.abs(eccentricityX)) / bx,
          (2 * Math.abs(eccentricityY)) / by,
        ),
        minimumPressure: null,
        maximumPressure: null,
        elasticMinimumPressure: elasticMinimum,
        elasticMaximumPressure: elasticMaximum,
        corners,
        pressurePolynomial: null,
        partialContact: null,
      };
    }
    const activeCorners = solved.polygon.map((point) => ({
      ...point,
      pressure: Math.max(0, pressureAt(point, solved.polynomial)),
    }));
    const maximumPressure = Math.max(
      ...corners.map((corner) => Math.max(0, pressureAt(corner, solved.polynomial))),
      ...activeCorners.map((corner) => corner.pressure),
    );
    return {
      status: "ok",
      contactType: "partial-biaxial",
      widthX: bx,
      widthY: by,
      area,
      nEd: compression,
      mxEd: mx,
      myEd: my,
      eccentricityX,
      eccentricityY,
      kernUtilizationX: (6 * Math.abs(eccentricityX)) / bx,
      kernUtilizationY: (6 * Math.abs(eccentricityY)) / by,
      equilibriumUtilization: Math.max(
        (2 * Math.abs(eccentricityX)) / bx,
        (2 * Math.abs(eccentricityY)) / by,
      ),
      contactArea: solved.moments.area,
      minimumPressure: 0,
      maximumPressure,
      elasticMinimumPressure: elasticMinimum,
      elasticMaximumPressure: elasticMaximum,
      corners,
      pressurePolynomial: solved.polynomial,
      partialContact: {
        axis: "biaxial",
        contactArea: solved.moments.area,
        polygon: solved.polygon,
        iterations: solved.iteration,
        equilibriumResidual: solved.residual,
        equilibriumResidualNorm: solved.residualNorm,
      },
    };
  }
}

export interface FootingPressureStripInput {
  contact?: RectangularFootingContactResult | null;
  axis?: "x" | "y";
  from?: number;
  to?: number;
  fixedCoordinate?: number;
  momentOrigin?: number | null;
  uniformDownwardPressure?: number;
}

export function integrateFootingPressureStrip({
  contact,
  axis,
  from,
  to,
  fixedCoordinate = 0,
  momentOrigin = null,
  uniformDownwardPressure = 0,
}: FootingPressureStripInput = {}) {
  if (!contact || !["full", "partial-uniaxial", "partial-biaxial"].includes(contact.contactType)) {
    throw new Error("A supported rectangular footing contact state is required.");
  }
  if (!["x", "y"].includes(axis ?? "")) {
    throw new Error("axis must be x or y.");
  }
  if (contact.pressurePolynomial == null) {
    throw new Error("A solved footing pressure polynomial is required.");
  }
  const resolvedFrom = finite(from, "from");
  const resolvedTo = finite(to, "to");
  const start = Math.min(resolvedFrom, resolvedTo);
  const end = Math.max(resolvedFrom, resolvedTo);
  const fixed = finite(fixedCoordinate, "fixedCoordinate");
  const downward = finite(uniformDownwardPressure, "uniformDownwardPressure");
  let activeStart = start;
  let activeEnd = end;
  let intercept = contact.pressurePolynomial.intercept;
  const slope =
    axis === "x" ? contact.pressurePolynomial.gradientX : contact.pressurePolynomial.gradientY;
  if (axis === "x") {
    intercept += contact.pressurePolynomial.gradientY * fixed;
  } else {
    intercept += contact.pressurePolynomial.gradientX * fixed;
  }
  if (contact.contactType !== "full") {
    const pressureStart = intercept + slope * activeStart;
    const pressureEnd = intercept + slope * activeEnd;
    if (pressureStart <= 0 && pressureEnd <= 0) {
      activeEnd = activeStart;
    } else if (pressureStart * pressureEnd < 0) {
      const zero = -intercept / slope;
      if (pressureStart > 0) activeEnd = Math.min(activeEnd, zero);
      else activeStart = Math.max(activeStart, zero);
    }
  }
  const primitiveForce = (coordinate: number): number =>
    intercept * coordinate + (slope * coordinate ** 2) / 2;
  const soilForce =
    activeEnd > activeStart ? primitiveForce(activeEnd) - primitiveForce(activeStart) : 0;
  const downwardForce = downward * (end - start);
  const netForce = soilForce - downwardForce;
  if (momentOrigin == null) {
    return { soilForce, downwardForce, netForce, netMoment: null };
  }
  const origin = finite(momentOrigin, "momentOrigin");
  const primitiveMoment = (coordinate: number): number =>
    intercept * (coordinate ** 2 / 2 - origin * coordinate) +
    slope * (coordinate ** 3 / 3 - (origin * coordinate ** 2) / 2);
  const soilMoment =
    activeEnd > activeStart ? primitiveMoment(activeEnd) - primitiveMoment(activeStart) : 0;
  const downwardMoment = downward * ((end ** 2 - start ** 2) / 2 - origin * (end - start));
  return {
    soilForce,
    downwardForce,
    netForce,
    soilMoment,
    downwardMoment,
    netMoment: soilMoment - downwardMoment,
  };
}

export function integrateFootingPressurePolygon({
  contact,
  polygon,
}: {
  contact?: RectangularFootingContactResult | null;
  polygon?: FootingPlanPoint[];
} = {}) {
  if (!contact?.pressurePolynomial) {
    throw new Error("A solved footing contact pressure polynomial is required.");
  }
  if (!Array.isArray(polygon)) {
    throw new Error("A footing pressure polygon is required.");
  }
  const activePolygon =
    contact.contactType === "full"
      ? polygon.map((point) => ({ ...point }))
      : clipCompressionPolygon(polygon, contact.pressurePolynomial);
  const moments = polygonMoments(activePolygon);
  const resultants = integratePlane(contact.pressurePolynomial, moments);
  return {
    activePolygon,
    area: moments.area,
    force: resultants.force,
    momentX: resultants.momentX,
    momentY: resultants.momentY,
  };
}
