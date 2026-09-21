'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/guard'
import { recordAudit } from '@/lib/audit'
import { runSimulation, simulatorEnabled, type SimulationReport } from '@/lib/simulator/engine'
import { purgeSimulatedData, summariseSimulatedData, type PurgeResult } from '@/lib/simulator/purge'
import { SCENARIOS, type ScenarioKey } from '@/lib/simulator/scenarios'

export interface RunResult {
  ok: boolean
  error?: string
  report?: SimulationReport
}

const SCENARIO_KEYS = SCENARIOS.map((s) => s.key) as [ScenarioKey, ...ScenarioKey[]]

const runSchema = z.object({
  count: z.coerce.number().int().min(1).max(200),
  spreadDays: z.coerce.number().int().min(0).max(365),
  scenarios: z.array(z.enum(SCENARIO_KEYS)).default([]),
  seed: z.union([z.literal(''), z.coerce.number().int().min(0)]).optional(),
})

export async function runSimulationAction(raw: unknown): Promise<RunResult> {
  try {
    const session = await requireAdmin('simulator.run')
    if (!simulatorEnabled()) {
      return { ok: false, error: 'הסימולטור מושבת בסביבה זו. להפעלה הגדירו ENABLE_SIMULATOR=true.' }
    }

    const parsed = runSchema.safeParse(raw)
    if (!parsed.success) return { ok: false, error: 'פרמטרים אינם תקינים' }

    const report = await runSimulation({
      count: parsed.data.count,
      spreadDays: parsed.data.spreadDays,
      scenarios: parsed.data.scenarios,
      seed: parsed.data.seed === '' || parsed.data.seed === undefined ? undefined : parsed.data.seed,
    })

    await recordAudit({
      userId: session.userId, actorEmail: session.email,
      action: 'simulator.run', entity: 'Simulation', entityId: String(report.seed),
      after: { requested: report.requested, created: report.created, failed: report.failed, byScenario: report.byScenario },
    })

    revalidatePath('/admin/simulator')
    revalidatePath('/admin/orders')
    revalidatePath('/admin')
    return { ok: true, report }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'הרצת הסימולציה נכשלה' }
  }
}

export interface PurgeActionResult {
  ok: boolean
  error?: string
  result?: PurgeResult
}

export async function purgeSimulationAction(confirmation: string): Promise<PurgeActionResult> {
  try {
    const session = await requireAdmin('simulator.run')
    // Typed confirmation — purging deletes rows and cannot be undone.
    if (confirmation.trim() !== 'מחק') {
      return { ok: false, error: 'לאישור המחיקה יש להקליד "מחק" בתיבת האישור' }
    }

    const before = await summariseSimulatedData()
    const result = await purgeSimulatedData()

    await recordAudit({
      userId: session.userId, actorEmail: session.email,
      action: 'simulator.purge', entity: 'Simulation', before, after: result,
    })

    revalidatePath('/admin/simulator')
    revalidatePath('/admin/orders')
    revalidatePath('/admin')
    return { ok: true, result }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'המחיקה נכשלה' }
  }
}
