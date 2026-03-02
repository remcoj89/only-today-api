import type { LifePillarsContent } from "../shared";

const defaultPillar = { task: "", completed: false } as const;

function normalizePillarValue(
  value: unknown,
  fallback: LifePillarsContent["training"]
): Partial<LifePillarsContent["training"]> {
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const result: Partial<LifePillarsContent["training"]> = {};
    if ("task" in obj) result.task = typeof obj.task === "string" ? obj.task : "";
    if ("completed" in obj) result.completed = Boolean(obj.completed);
    return result;
  }
  if (typeof value === "boolean") {
    return { task: "", completed: value };
  }
  return {};
}

export function mergeLifePillars(
  base: LifePillarsContent,
  incoming: unknown
): LifePillarsContent {
  const raw = incoming as Record<string, unknown> | undefined;
  if (!raw) return base;
  return {
    training: {
      ...base.training,
      ...normalizePillarValue(raw.training, base.training)
    },
    deepRelaxation: {
      ...base.deepRelaxation,
      ...normalizePillarValue(raw.deepRelaxation, base.deepRelaxation)
    },
    healthyNutrition: {
      ...base.healthyNutrition,
      ...normalizePillarValue(raw.healthyNutrition, base.healthyNutrition)
    },
    realConnection: {
      ...base.realConnection,
      ...normalizePillarValue(raw.realConnection, base.realConnection)
    }
  };
}

export function getDefaultLifePillars(): LifePillarsContent {
  return {
    training: { ...defaultPillar },
    deepRelaxation: { ...defaultPillar },
    healthyNutrition: { ...defaultPillar },
    realConnection: { ...defaultPillar }
  };
}

function isPillarCompleted(pillar: unknown): boolean {
  if (typeof pillar === "boolean") return pillar;
  if (pillar && typeof pillar === "object" && "completed" in pillar) {
    return Boolean((pillar as { completed: unknown }).completed);
  }
  return false;
}

export function hasAllPillars(pillars: LifePillarsContent | Record<string, unknown>): boolean {
  const raw = pillars as Record<string, unknown>;
  return (
    isPillarCompleted(raw.training) &&
    isPillarCompleted(raw.deepRelaxation) &&
    isPillarCompleted(raw.healthyNutrition) &&
    isPillarCompleted(raw.realConnection)
  );
}
