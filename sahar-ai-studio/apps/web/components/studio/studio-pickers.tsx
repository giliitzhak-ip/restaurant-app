'use client';

import { useRouter } from 'next/navigation';
import { Label } from '@/components/ui/label';

/** Project selector; navigation keeps the selection in the URL (shareable, back button). */
export function ProjectSelect({
  projects,
  selectedId,
  label,
}: {
  projects: { id: string; title: string }[];
  selectedId: string;
  label: string;
}) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="studio-project">{label}</Label>
      <select
        id="studio-project"
        value={selectedId}
        onChange={(event) =>
          router.push(`/studio?project=${encodeURIComponent(event.target.value)}`)
        }
        className="h-11 rounded-md border border-input bg-surface px-3 text-base sm:h-10 sm:text-sm"
        dir="auto"
        data-testid="studio-project"
      >
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.title}
          </option>
        ))}
      </select>
    </div>
  );
}
