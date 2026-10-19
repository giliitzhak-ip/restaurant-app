'use server';

import { prisma } from '@sahar/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { audit } from './audit';
import { requireUser } from './auth/session';
import { findOwnedCharacter } from './characters';
import { getI18n } from './i18n/server';
import { findOwnedProject } from './projects';

export interface ProjectFormState {
  ok?: boolean;
  error?: string;
  projectId?: string;
}

const OUTPUT = {
  LANDSCAPE_16_9: { outputWidth: 1920, outputHeight: 1080 },
  PORTRAIT_9_16: { outputWidth: 1080, outputHeight: 1920 },
} as const;

const projectSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000),
  aspectRatio: z.enum(['LANDSCAPE_16_9', 'PORTRAIT_9_16']),
  mainCharacterId: z.string().max(64),
});

async function parseProject(ownerId: string, formData: FormData) {
  const parsed = projectSchema.safeParse({
    title: formData.get('title') ?? '',
    description: formData.get('description') ?? '',
    aspectRatio: formData.get('aspectRatio') ?? '',
    mainCharacterId: formData.get('mainCharacterId') ?? '',
  });
  if (!parsed.success)
    return {
      ok: false as const,
      titleProblem: parsed.error.issues.some((i) => i.path[0] === 'title'),
    };
  const { mainCharacterId, aspectRatio, ...rest } = parsed.data;
  if (mainCharacterId && !(await findOwnedCharacter(ownerId, mainCharacterId)))
    return { ok: false as const, titleProblem: false };
  return {
    ok: true as const,
    data: {
      ...rest,
      aspectRatio,
      ...OUTPUT[aspectRatio],
      mainCharacterId: mainCharacterId || null,
    },
  };
}

/** Creates the project; the client then streams the song to /api/uploads. */
export async function createProjectAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const user = await requireUser();
  const { t } = await getI18n();
  const parsed = await parseProject(user.id, formData);
  if (!parsed.ok)
    return { error: parsed.titleProblem ? t.projects.form.titleRequired : t.projects.form.invalid };
  const project = await prisma.project.create({ data: { ownerId: user.id, ...parsed.data } });
  await audit({ action: 'project.create', userId: user.id, metadata: { projectId: project.id } });
  revalidatePath('/projects');
  return { ok: true, projectId: project.id };
}

export async function updateProjectAction(
  projectId: string,
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const user = await requireUser();
  const { t } = await getI18n();
  if (!(await findOwnedProject(user.id, projectId))) return { error: t.notFound.title };
  const parsed = await parseProject(user.id, formData);
  if (!parsed.ok)
    return { error: parsed.titleProblem ? t.projects.form.titleRequired : t.projects.form.invalid };
  await prisma.project.update({ where: { id: projectId }, data: parsed.data });
  await audit({ action: 'project.update', userId: user.id, metadata: { projectId } });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function deleteProjectAction(projectId: string): Promise<void> {
  const user = await requireUser();
  if (!(await findOwnedProject(user.id, projectId))) return;
  await prisma.project.update({ where: { id: projectId }, data: { deletedAt: new Date() } });
  await audit({ action: 'project.delete', userId: user.id, metadata: { projectId } });
  redirect('/projects');
}
