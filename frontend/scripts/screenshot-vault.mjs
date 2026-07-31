// Re-runnable Playwright capture of the /vault page in light + dark themes.
//
// Usage:
//   node frontend/scripts/screenshot-vault.mjs <baseUrl> <suffix>
//
//   baseUrl  default: http://localhost:5173 (must be a running vite dev server
//            or vite preview — the script does not start one)
//   suffix   'before' | 'after' — controls the output filename
//
// Output:
//   frontend/docs/migration/screenshots/{light,dark}-{suffix}.png
//
// Page state caveat: BEFORE screenshots are captured against whatever the
// current vault page renders (likely "NO ADDRESS SELECTED" empty state when
// no wallet is connected). The AFTER capture in 23-04 reuses this script
// against the same setup so the diff stays fair. Phase 23-CONTEXT.md §"Page
// state for screenshots" documents this pragma.

import { chromium } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const baseUrl = process.argv[2] ?? 'http://localhost:5173'
const suffix = process.argv[3] ?? 'before'
if (!['before', 'after'].includes(suffix)) {
  throw new Error(`suffix must be 'before' or 'after' — got: ${suffix}`)
}

const outDir = path.resolve(__dirname, '..', 'docs', 'migration', 'screenshots')
await mkdir(outDir, { recursive: true })

const themes = ['light', 'dark']

const launchOpts = { headless: true }
// Allow a system chromium to be plugged in if `playwright install chromium`
// was not run (e.g. sandboxed CI). The user can set CHROMIUM_PATH=$(which
// chromium) to point at a system browser.
if (process.env.CHROMIUM_PATH) {
  launchOpts.executablePath = process.env.CHROMIUM_PATH
}

const browser = await chromium.launch(launchOpts)
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  await page.goto(`${baseUrl}/vault`, { waitUntil: 'networkidle' })

  for (const theme of themes) {
    await page.evaluate(
      (t) => document.documentElement.setAttribute('data-theme', t),
      theme,
    )
    // Allow tokens.css to apply the new theme variables before capture.
    await page.waitForTimeout(250)

    const out = path.join(outDir, `${theme}-${suffix}.png`)
    await page.screenshot({ path: out, fullPage: true })
    console.log(`[ok] wrote ${out}`)
  }
} finally {
  await browser.close()
}
