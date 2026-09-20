import type { SceneObjectType, SceneSnapTarget } from "@/types/scene";

/**
 * The object library.
 *
 * One list, read by three things: the SVG generator that draws the artwork,
 * the seed that creates the rows, and the drawer that offers them. Keeping it
 * in one place is what stops a seeded asset from pointing at a file nobody
 * generated.
 *
 * Every entry carries **real-world centimetres**, and that is the point of the
 * whole file. A television dropped into a photo is only convincing if a 65"
 * comes out bigger than a 55" by the right amount; a sideboard is only
 * convincing if it is as wide as three of the planks on the floor behind it.
 * The editor converts these against the room width the customer sets, so the
 * first drop is already close to right and they are nudging rather than
 * guessing.
 *
 * Nothing here is for sale. These are drawings — clean vector illustrations,
 * not photographs of stock — and they are labelled "for illustration only"
 * until an administrator links one to a real catalogue product. There is no
 * price in this file and there is deliberately nowhere to put one.
 */

export interface LibraryCategorySeed {
  key: SceneObjectType;
  /** Hebrew, as it appears in the drawer. */
  name: string;
  sortOrder: number;
}

export interface LibraryAssetSeed {
  slug: string;
  category: SceneObjectType;
  name: string;
  widthCm: number;
  heightCm: number;
  snap: SceneSnapTarget;
  sortOrder: number;
}

export const libraryCategories: LibraryCategorySeed[] = [
  { key: "TV", name: "טלוויזיות", sortOrder: 10 },
  { key: "TV_WALL", name: "קיר טלוויזיה מלא", sortOrder: 20 },
  { key: "SIDEBOARD_WALL", name: "מזנון תלוי", sortOrder: 30 },
  { key: "SIDEBOARD_FLOOR", name: "מזנון רצפתי", sortOrder: 40 },
  { key: "FLOATING_SHELF", name: "מדפים צפים", sortOrder: 50 },
  { key: "NICHE", name: "נישות דקורטיביות", sortOrder: 60 },
  { key: "HOME_BAR", name: "בר ביתי", sortOrder: 70 },
  { key: "BAR_COUNTER", name: "דלפק בר", sortOrder: 80 },
  { key: "DRINKS_CABINET", name: "ארון משקאות", sortOrder: 90 },
  { key: "WINE_FRIDGE", name: "מקרר יין", sortOrder: 100 },
  { key: "BOOKCASE", name: "ספרייה", sortOrder: 110 },
  { key: "FIREPLACE", name: "קמין חשמלי", sortOrder: 120 },
  { key: "MIRROR", name: "מראות", sortOrder: 130 },
  { key: "WALL_ART", name: "תמונות ואמנות קיר", sortOrder: 140 },
  { key: "SPEAKER", name: "רמקולים", sortOrder: 150 },
  { key: "PLANT", name: "עציצים", sortOrder: 160 },
  { key: "CABINET_LOW", name: "ארונות נמוכים", sortOrder: 170 },
  { key: "CABINET_TALL", name: "ארונות גבוהים", sortOrder: 180 },
  { key: "CONSOLE_TABLE", name: "שולחן קונסולה", sortOrder: 190 },
  { key: "CUSTOM", name: "מוצר מותאם אישית", sortOrder: 200 },
];

/**
 * Screen sizes are the diagonal in inches converted to a 16:9 panel plus a
 * centimetre of bezel, which is why a 65" is 145cm wide rather than 165.
 */
export const libraryAssets: LibraryAssetSeed[] = [
  { slug: "tv-43", category: "TV", name: 'טלוויזיה 43"', widthCm: 97, heightCm: 57, snap: "WALL", sortOrder: 10 },
  { slug: "tv-55", category: "TV", name: 'טלוויזיה 55"', widthCm: 123, heightCm: 71, snap: "WALL", sortOrder: 20 },
  { slug: "tv-65", category: "TV", name: 'טלוויזיה 65"', widthCm: 145, heightCm: 84, snap: "WALL", sortOrder: 30 },
  { slug: "tv-75", category: "TV", name: 'טלוויזיה 75"', widthCm: 167, heightCm: 96, snap: "WALL", sortOrder: 40 },
  { slug: "tv-85", category: "TV", name: 'טלוויזיה 85"', widthCm: 189, heightCm: 108, snap: "WALL", sortOrder: 50 },

  { slug: "tv-wall-wide", category: "TV_WALL", name: "קיר טלוויזיה רחב", widthCm: 360, heightCm: 260, snap: "WALL", sortOrder: 10 },
  { slug: "tv-wall-compact", category: "TV_WALL", name: "קיר טלוויזיה קומפקטי", widthCm: 280, heightCm: 240, snap: "WALL", sortOrder: 20 },

  { slug: "sideboard-wall-160", category: "SIDEBOARD_WALL", name: "מזנון תלוי 160", widthCm: 160, heightCm: 40, snap: "WALL", sortOrder: 10 },
  { slug: "sideboard-wall-200", category: "SIDEBOARD_WALL", name: "מזנון תלוי 200", widthCm: 200, heightCm: 45, snap: "WALL", sortOrder: 20 },
  { slug: "sideboard-wall-240", category: "SIDEBOARD_WALL", name: "מזנון תלוי 240", widthCm: 240, heightCm: 45, snap: "WALL", sortOrder: 30 },

  { slug: "sideboard-floor-150", category: "SIDEBOARD_FLOOR", name: "מזנון רצפתי 150", widthCm: 150, heightCm: 52, snap: "FLOOR", sortOrder: 10 },
  { slug: "sideboard-floor-200", category: "SIDEBOARD_FLOOR", name: "מזנון רצפתי 200", widthCm: 200, heightCm: 56, snap: "FLOOR", sortOrder: 20 },

  { slug: "shelf-90", category: "FLOATING_SHELF", name: "מדף צף 90", widthCm: 90, heightCm: 5, snap: "WALL", sortOrder: 10 },
  { slug: "shelf-120", category: "FLOATING_SHELF", name: "מדף צף 120", widthCm: 120, heightCm: 5, snap: "WALL", sortOrder: 20 },
  { slug: "shelf-180", category: "FLOATING_SHELF", name: "מדף צף 180", widthCm: 180, heightCm: 6, snap: "WALL", sortOrder: 30 },

  { slug: "niche-tall", category: "NICHE", name: "נישה אנכית", widthCm: 60, heightCm: 150, snap: "WALL", sortOrder: 10 },
  { slug: "niche-wide", category: "NICHE", name: "נישה אופקית", widthCm: 140, heightCm: 60, snap: "WALL", sortOrder: 20 },
  { slug: "niche-square", category: "NICHE", name: "נישה ריבועית", widthCm: 70, heightCm: 70, snap: "WALL", sortOrder: 30 },

  { slug: "home-bar", category: "HOME_BAR", name: "בר ביתי", widthCm: 190, heightCm: 200, snap: "FLOOR", sortOrder: 10 },
  { slug: "bar-counter-160", category: "BAR_COUNTER", name: "דלפק בר 160", widthCm: 160, heightCm: 105, snap: "FLOOR", sortOrder: 10 },
  { slug: "bar-counter-220", category: "BAR_COUNTER", name: "דלפק בר 220", widthCm: 220, heightCm: 105, snap: "FLOOR", sortOrder: 20 },

  { slug: "drinks-cabinet", category: "DRINKS_CABINET", name: "ארון משקאות", widthCm: 90, heightCm: 180, snap: "FLOOR", sortOrder: 10 },
  { slug: "wine-fridge-tall", category: "WINE_FRIDGE", name: "מקרר יין גבוה", widthCm: 60, heightCm: 145, snap: "FLOOR", sortOrder: 10 },
  { slug: "wine-fridge-under", category: "WINE_FRIDGE", name: "מקרר יין שולחני", widthCm: 45, heightCm: 85, snap: "FLOOR", sortOrder: 20 },

  { slug: "bookcase-wide", category: "BOOKCASE", name: "ספרייה רחבה", widthCm: 200, heightCm: 200, snap: "FLOOR", sortOrder: 10 },
  { slug: "bookcase-narrow", category: "BOOKCASE", name: "ספרייה צרה", widthCm: 90, heightCm: 200, snap: "FLOOR", sortOrder: 20 },

  { slug: "fireplace-100", category: "FIREPLACE", name: "קמין חשמלי 100", widthCm: 100, heightCm: 42, snap: "WALL", sortOrder: 10 },
  { slug: "fireplace-150", category: "FIREPLACE", name: "קמין חשמלי 150", widthCm: 150, heightCm: 50, snap: "WALL", sortOrder: 20 },

  { slug: "mirror-tall", category: "MIRROR", name: "מראה אנכית", widthCm: 60, heightCm: 160, snap: "WALL", sortOrder: 10 },
  { slug: "mirror-round", category: "MIRROR", name: "מראה עגולה", widthCm: 80, heightCm: 80, snap: "WALL", sortOrder: 20 },

  { slug: "art-portrait", category: "WALL_ART", name: "תמונה אנכית", widthCm: 60, heightCm: 80, snap: "WALL", sortOrder: 10 },
  { slug: "art-landscape", category: "WALL_ART", name: "תמונה אופקית", widthCm: 110, heightCm: 75, snap: "WALL", sortOrder: 20 },
  { slug: "art-triptych", category: "WALL_ART", name: "טריפטיכון", widthCm: 180, heightCm: 70, snap: "WALL", sortOrder: 30 },

  { slug: "speaker-floor", category: "SPEAKER", name: "רמקול עמוד", widthCm: 25, heightCm: 105, snap: "FLOOR", sortOrder: 10 },
  { slug: "speaker-shelf", category: "SPEAKER", name: "רמקול מדף", widthCm: 16, heightCm: 26, snap: "FREE", sortOrder: 20 },

  { slug: "plant-tall", category: "PLANT", name: "עציץ גבוה", widthCm: 65, heightCm: 150, snap: "FLOOR", sortOrder: 10 },
  { slug: "plant-small", category: "PLANT", name: "עציץ קטן", widthCm: 32, heightCm: 45, snap: "FREE", sortOrder: 20 },

  { slug: "cabinet-low", category: "CABINET_LOW", name: "ארון נמוך", widthCm: 120, heightCm: 85, snap: "FLOOR", sortOrder: 10 },
  { slug: "cabinet-tall", category: "CABINET_TALL", name: "ארון גבוה", widthCm: 100, heightCm: 215, snap: "FLOOR", sortOrder: 10 },
  { slug: "console-table", category: "CONSOLE_TABLE", name: "שולחן קונסולה", widthCm: 120, heightCm: 80, snap: "FLOOR", sortOrder: 10 },
];

/** Where the generator writes, and where the seeded rows point. */
export const objectAssetUrl = (slug: string) => `/media/objects/${slug}.svg`;
