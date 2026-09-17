import type {
  Availability,
  MaterialFamily,
  PatternType,
  StyleTag,
  SurfaceTarget,
  Tone,
  UsageArea,
  WaterResistance,
} from "@/types/catalog";

export const toneLabels: Record<Tone, string> = {
  LIGHT: "בהיר",
  NATURAL: "טבעי",
  WARM: "חמים",
  COLD: "קר",
  DARK: "כהה",
};

export const materialLabels: Record<MaterialFamily, string> = {
  WOOD: "עץ",
  SPC: "SPC",
  LAMINATE: "למינציה",
  MDF: "MDF",
  STONE: "אבן",
  CONCRETE: "בטון",
  PVC: "PVC / לבד",
  METAL: "מתכת",
};

export const styleLabels: Record<StyleTag, string> = {
  MODERN: "מודרני",
  MINIMAL: "מינימלי",
  LUXURY: "יוקרתי",
  WARM: "חמים",
  SCANDINAVIAN: "סקנדינבי",
  INDUSTRIAL: "תעשייתי",
  CLASSIC: "קלאסי",
};

export const waterLabels: Record<WaterResistance, string> = {
  WATERPROOF: "עמיד במים",
  SPLASH_PROOF: "עמיד להתזות",
  NOT_RESISTANT: "לא עמיד במים",
};

export const usageLabels: Record<UsageArea, string> = {
  INDOOR: "פנים",
  OUTDOOR: "חוץ",
  BOTH: "פנים וחוץ",
};

export const availabilityLabels: Record<Availability, string> = {
  IN_STOCK: "במלאי",
  LOW_STOCK: "מלאי מוגבל",
  MADE_TO_ORDER: "בהזמנה מיוחדת",
  OUT_OF_STOCK: "אזל מהמלאי",
};

export const surfaceLabels: Record<SurfaceTarget, string> = {
  FLOOR: "רצפה",
  WALL: "קיר",
  BOTH: "רצפה וקיר",
};

export const patternLabels: Record<PatternType, string> = {
  PLANK: "לוחות",
  TILE: "אריחים",
  PANEL: "פאנל",
  STONE: "אבן",
  CUSTOM: "מותאם",
};
