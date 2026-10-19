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

export const PRIMARY_PRESET_KEY = 'sharona-sahar';

export const CHARACTER_PRESETS: readonly CharacterPreset[] = [
  {
    key: PRIMARY_PRESET_KEY,
    name: 'שרונה סהר',
    description:
      'זמרת ים-תיכונית צעירה — הדמות הראשית של הסטודיו. העלו תמונת ייחוס מאושרת כדי להשתמש בה ביצירה.',
    // Prompt text stays in English: video models are prompted in English.
    defaultAppearance:
      'Young female Mizrahi singer, long black hair, blue eyes, subtle makeup, elegant black dress, realistic nostalgic cinematic appearance.',
    clothingPresets: [{ name: 'שמלה שחורה אלגנטית', description: 'elegant black dress' }],
    stylePresets: [
      {
        name: 'קולנועי נוסטלגי',
        description: 'realistic, nostalgic cinematic look, soft warm lighting, subtle film grain',
      },
    ],
  },
];
