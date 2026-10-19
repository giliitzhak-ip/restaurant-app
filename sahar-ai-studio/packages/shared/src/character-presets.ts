/**
 * Built-in character presets. A preset is copied into a user's character library as an
 * ordinary, editable Character. Presets never ship with reference photographs: the user
 * must upload an approved image they hold the rights to.
 */
export interface CharacterPreset {
  key: string;
  name: string;
  description: string;
  defaultAppearance: string;
  clothingPresets: { name: string; description: string }[];
  stylePresets: { name: string; description: string }[];
}

export const CHARACTER_PRESETS: readonly CharacterPreset[] = [
  {
    key: 'sharona-sahar',
    name: 'Sharona Sahar',
    description: 'זמרת ים-תיכונית צעירה — דמות ברירת המחדל של הסטודיו.',
    defaultAppearance:
      'Young female Mizrahi singer, long black hair, blue eyes, subtle makeup, elegant black dress, realistic nostalgic cinematic appearance.',
    clothingPresets: [{ name: 'Elegant black dress', description: 'elegant black dress' }],
    stylePresets: [
      {
        name: 'Nostalgic cinematic',
        description: 'realistic, nostalgic cinematic look, soft warm lighting, film grain',
      },
    ],
  },
];
