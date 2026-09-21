import 'dotenv/config'
import { runSimulation } from '../src/lib/simulator/engine'
import { purgeSimulatedData, summariseSimulatedData } from '../src/lib/simulator/purge'
import { SCENARIOS, type ScenarioKey } from '../src/lib/simulator/scenarios'
import { prisma } from '../src/lib/db'
import { formatAgorot } from '../src/lib/money'

/**
 * CLI front end for the operations simulator.
 *
 *   npm run simulate -- --count 40 --days 30
 *   npm run simulate -- --scenarios HAPPY_PATH,REFUNDED --seed 42
 *   npm run simulate -- --purge
 */
function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

async function main() {
  if (flag('purge')) {
    const before = await summariseSimulatedData()
    const result = await purgeSimulatedData()
    console.log(`נמחקו ${result.orders} הזמנות, ${result.customers} לקוחות, ${result.carts} עגלות, ${result.movements} תנועות מלאי.`)
    console.log(`״הכנסות״ מדומות שהוסרו: ${formatAgorot(before.revenue)}`)
    return
  }

  const scenariosArg = arg('scenarios')
  const known = new Set(SCENARIOS.map((s) => s.key))
  const scenarios = scenariosArg
    ? scenariosArg.split(',').map((s) => s.trim()).filter((s): s is ScenarioKey => known.has(s as ScenarioKey))
    : []

  if (scenariosArg && scenarios.length === 0) {
    console.error(`תרחיש לא מוכר. אפשרויות: ${[...known].join(', ')}`)
    process.exitCode = 1
    return
  }

  const report = await runSimulation({
    count: Number(arg('count') ?? 25),
    spreadDays: Number(arg('days') ?? 30),
    scenarios,
    seed: arg('seed') ? Number(arg('seed')) : undefined,
  })

  console.log(`\n▶ seed ${report.seed}`)
  console.table(report.byScenario)
  console.log(`נוצרו ${report.created} · נכשלו ${report.failed} מתוך ${report.requested}`)
  for (const warning of report.warnings) console.warn(`⚠ ${warning}`)

  const failures = report.outcomes.filter((o) => !o.ok)
  if (failures.length > 0) {
    console.log('\nתרחישים שנכשלו:')
    for (const failure of failures.slice(0, 20)) {
      console.log(` - ${failure.scenario}: ${failure.detail}`)
    }
  }

  const summary = await summariseSimulatedData()
  console.log(`\nסה״כ במערכת: ${summary.orders} הזמנות סימולציה · ${formatAgorot(summary.revenue)}`)
  console.log('למחיקה: npm run simulate -- --purge\n')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
