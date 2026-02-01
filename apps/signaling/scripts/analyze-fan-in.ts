/**
 * Fan-In Analysis for Dynamic Coverage Thresholds
 *
 * Analyzes which modules have the most dependents (fan-in).
 * High fan-in = critical code = higher coverage requirements.
 *
 * Usage:
 *   npx tsx scripts/analyze-fan-in.ts          # Print analysis
 *   import { analyzeFanIn } from './scripts/analyze-fan-in'  # Use in vitest config
 */

import fs from 'node:fs'
import path from 'node:path'

export interface FanInResult {
  file: string
  fanIn: number
  tier: 'critical' | 'high' | 'medium' | 'low'
  /** True if this file matches a public API pattern */
  isPublicApi?: boolean
}

export interface CoverageThresholds {
  branches?: number
  functions?: number
  lines?: number
  statements?: number
}

export interface FanInAnalysis {
  results: Map<string, FanInResult>
  stats: {
    totalModules: number
    maxFanIn: number
    avgFanIn: number
  }
}

/**
 * Coverage model based on blast radius (fan-in).
 *
 * Philosophy:
 * - High fan-in = shared infrastructure = changes affect many callers = strict
 * - Routes/entry points = integration test requirement (separate validation)
 * - Low fan-in = single-use code = lenient (low blast radius)
 */
export const DEFAULT_TIER_THRESHOLDS: Record<
  FanInResult['tier'],
  CoverageThresholds
> = {
  critical: { branches: 60 },
  high: { branches: 60 },
  medium: { branches: 60 },
  low: {},
}

export function analyzeFanIn(options: AnalyzeOptions): FanInAnalysis {
  const {
    srcDir,
    pathAliases = { '@/': './src/' },
    excludePatterns = DEFAULT_EXCLUDE,
    publicApiPatterns = [],
    countTypeImports = false,
  } = options

  const absSrcDir = path.resolve(srcDir)
  const files = getAllTsFiles(absSrcDir, excludePatterns)

  const fanInCounts: Record<string, number> = {}
  for (const f of files) {
    fanInCounts[path.relative(absSrcDir, f).replace(/\.ts$/, '')] = 0
  }

  for (const file of files) {
    for (const imp of getImports(file)) {
      if (!countTypeImports && imp.isTypeOnly) continue

      const resolved = resolveImport(imp.path, file, absSrcDir, pathAliases)
      if (resolved) {
        const key = path.relative(absSrcDir, resolved).replace(/\.ts$/, '')
        if (fanInCounts[key] !== undefined) {
          fanInCounts[key]++
        }
      }
    }
  }

  for (const file of Object.keys(fanInCounts)) {
    if (publicApiPatterns.some(pattern => pattern.test(file))) {
      fanInCounts[file] += PUBLIC_API_BOOST
    }
  }

  const results = new Map<string, FanInResult>()
  let maxFanIn = 0
  let totalFanIn = 0

  for (const [file, fanIn] of Object.entries(fanInCounts)) {
    const isPublic = publicApiPatterns.some(pattern => pattern.test(file))
    results.set(file, {
      file,
      fanIn,
      tier: getTier(fanIn),
      ...(isPublic && { isPublicApi: true }),
    } as FanInResult)
    maxFanIn = Math.max(maxFanIn, fanIn)
    totalFanIn += fanIn
  }

  return {
    results,
    stats: {
      totalModules: files.length,
      maxFanIn,
      avgFanIn: totalFanIn / files.length,
    },
  }
}

/**
 * Generate Vitest coverage thresholds based on fan-in analysis.
 * Higher fan-in = stricter coverage requirements.
 *
 * @param srcDir - Source directory to analyze
 * @param tierThresholds - Override default thresholds per tier
 * @param enabled - Set to false to disable (returns empty object)
 */
export function generateCoverageThresholds(
  srcDir: string,
  tierThresholds: Record<
    FanInResult['tier'],
    CoverageThresholds
  > = DEFAULT_TIER_THRESHOLDS,
  enabled = true,
): Record<string, CoverageThresholds> {
  if (!enabled) return {}
  const analysis = analyzeFanIn({ srcDir, pathAliases: { '@/': './src/' } })
  const thresholds: Record<string, CoverageThresholds> = {}

  for (const [file, result] of analysis.results) {
    if (result.tier === 'low') continue

    const glob = `src/${file}.ts`
    thresholds[glob] = tierThresholds[result.tier]
  }

  return thresholds
}

interface AnalyzeOptions {
  srcDir: string
  pathAliases?: Record<string, string>
  excludePatterns?: RegExp[]
  /**
   * Patterns for "public API" files that get automatic tier boost.
   * These are files exposed to external consumers (other packages, FE, etc.)
   * Matching files get +10 virtual fan-in (effectively making them 'critical').
   */
  publicApiPatterns?: RegExp[]
  /**
   * Whether to count type-only imports in fan-in calculation.
   * Default: false (coverage tests runtime code, not types)
   * Set true to include type-only imports in blast radius.
   */
  countTypeImports?: boolean
}

interface ImportInfo {
  path: string
  isTypeOnly: boolean
}

const DEFAULT_EXCLUDE = [
  /\.test\.ts$/,
  /\.spec\.ts$/,
  /\.d\.ts$/,
  /__tests__/,
  /node_modules/,
]

/** Virtual fan-in boost for public API files */
const PUBLIC_API_BOOST = 10

function getAllTsFiles(
  dir: string,
  exclude: RegExp[],
  files: string[] = [],
): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (exclude.some(p => p.test(fullPath))) continue

    if (entry.isDirectory()) {
      getAllTsFiles(fullPath, exclude, files)
    } else if (entry.name.endsWith('.ts')) {
      files.push(fullPath)
    }
  }
  return files
}

function getImports(filePath: string): ImportInfo[] {
  const content = fs.readFileSync(filePath, 'utf-8')
  const imports: ImportInfo[] = []

  const regex = /import\s+(type\s+)?.*?from\s+["']([^"']+)["']/g
  let match: RegExpExecArray | null = regex.exec(content)
  while (match !== null) {
    const isTypeOnly = match[1] !== undefined
    imports.push({ path: match[2], isTypeOnly })
    match = regex.exec(content)
  }
  return imports
}

function resolveImport(
  importPath: string,
  fromFile: string,
  srcDir: string,
  aliases: Record<string, string>,
): string | null {
  for (const [alias, replacement] of Object.entries(aliases)) {
    const aliasPrefix = alias.replace('*', '')
    if (importPath.startsWith(aliasPrefix)) {
      const resolved = importPath.replace(
        aliasPrefix,
        replacement.replace('*', ''),
      )
      return path.resolve(srcDir, '..', resolved)
    }
  }

  if (importPath.startsWith('./') || importPath.startsWith('../')) {
    return path.resolve(path.dirname(fromFile), importPath)
  }

  return null
}

/**
 * Tier assignment based on fan-in (number of internal dependents).
 * Fan-in >= 3 = "shared infrastructure" with blast radius.
 */
function getTier(fanIn: number): FanInResult['tier'] {
  if (fanIn >= 10) return 'critical'
  if (fanIn >= 5) return 'high'
  if (fanIn >= 3) return 'medium'
  return 'low'
}

if (process.argv[1]?.endsWith('analyze-fan-in.ts')) {
  const analysis = analyzeFanIn({
    srcDir: './src',
    pathAliases: { '@/': './src/' },
  })

  console.log('\n=== SIGNALING COVERAGE MODEL ===\n')
  console.log(
    `Total modules: ${analysis.stats.totalModules} | Max fan-in: ${analysis.stats.maxFanIn}\n`,
  )

  const sorted = [...analysis.results.values()].sort(
    (a, b) => b.fanIn - a.fanIn,
  )

  const sharedInfra = sorted.filter(r => r.fanIn >= 3)
  console.log(
    `📦 Tier 1: Shared Infrastructure (fan-in >= 3) → ${DEFAULT_TIER_THRESHOLDS.critical.branches}% branch coverage\n`,
  )

  if (sharedInfra.length === 0) {
    console.log('   (none yet - good! keep code decoupled)\n')
  } else {
    for (const r of sharedInfra) {
      const tierColor = getTierColor(r.tier)
      console.log(`   ${tierColor} ${r.file.padEnd(40)} fan-in: ${r.fanIn}`)
    }
    console.log('')
  }

  console.log('🌐 Tier 2: Public Interface → Integration test required')
  console.log(
    '   Run tests to see coverage (see tests/integration-coverage.test.ts)\n',
  )

  console.log(`🛡️  Tier 3: Safety Net → Function coverage per file`)
  console.log('   Catches completely untested files\n')

  console.log('─'.repeat(60))
  console.log(
    `\n✅ ${sharedInfra.length} files will require ${DEFAULT_TIER_THRESHOLDS.critical.branches}% branch coverage`,
  )
  console.log(
    `ℹ️  ${sorted.length - sharedInfra.length} files use global defaults`,
  )
  console.log(
    '\nℹ️  Fan-in = internal runtime imports only (type-only imports excluded)',
  )
}

function getTierColor(tier: FanInResult['tier']): string {
  switch (tier) {
    case 'critical':
      return '🔴'
    case 'high':
      return '🟠'
    case 'medium':
      return '🟡'
    case 'low':
      return '⚪'
    default: {
      const _never: never = tier
      throw new Error(`Unhandled tier: ${_never}`)
    }
  }
}
