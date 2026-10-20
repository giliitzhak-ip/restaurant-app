import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Dictionary } from '@/lib/i18n/config';

export interface CharacterChoice {
  id: string;
  name: string;
  hasReference: boolean;
}

export interface ProjectFieldValues {
  title: string;
  description: string;
  aspectRatio: 'LANDSCAPE_16_9' | 'PORTRAIT_9_16';
  mainCharacterId: string | null;
}

/** Fields shared by the create and edit forms (plain inputs: native pickers on iPhone). */
export function ProjectFields({
  t,
  characters,
  initial,
}: {
  t: Dictionary['projects'];
  characters: CharacterChoice[];
  initial?: ProjectFieldValues;
}) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">{t.form.title}</Label>
        <Input id="title" name="title" required maxLength={120} defaultValue={initial?.title} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">{t.form.description}</Label>
        <Textarea
          id="description"
          name="description"
          maxLength={2000}
          defaultValue={initial?.description}
          className="min-h-16"
        />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{t.form.aspectRatio}</legend>
        <div className="grid grid-cols-2 gap-2">
          {(['LANDSCAPE_16_9', 'PORTRAIT_9_16'] as const).map((value) => (
            <label
              key={value}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-input bg-surface px-3 has-[:checked]:border-gold-400 has-[:checked]:bg-accent"
            >
              <input
                type="radio"
                name="aspectRatio"
                value={value}
                defaultChecked={(initial?.aspectRatio ?? 'LANDSCAPE_16_9') === value}
                className="accent-[var(--color-gold-400)]"
              />
              <span
                aria-hidden
                className={
                  value === 'LANDSCAPE_16_9'
                    ? 'h-4 w-7 rounded-sm border border-current'
                    : 'h-7 w-4 rounded-sm border border-current'
                }
              />
              <span className="text-sm whitespace-nowrap">{t.aspect[value]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-2">
        <Label htmlFor="mainCharacterId">{t.form.mainCharacter}</Label>
        <select
          id="mainCharacterId"
          name="mainCharacterId"
          defaultValue={initial ? (initial.mainCharacterId ?? '') : (characters[0]?.id ?? '')}
          className="h-11 rounded-md border border-input bg-surface px-3 text-base sm:h-10 sm:text-sm"
        >
          {characters.map((character) => (
            <option key={character.id} value={character.id}>
              {character.name}
            </option>
          ))}
          <option value="">{t.form.noCharacter}</option>
        </select>
        <p className="text-xs text-muted-foreground">{t.form.mainCharacterHint}</p>
      </div>
    </>
  );
}
