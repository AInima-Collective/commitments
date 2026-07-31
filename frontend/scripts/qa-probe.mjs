// QA probe: load one route, capture runtime health signals, screenshot.
//
// Usage:
//   node scripts/qa-probe.mjs <routePath> [themeOverride]
//   node scripts/qa-probe.mjs /app/vaults
//
// Emits a single JSON object to stdout:
//   { route, ok, consoleErrors[], pageErrors[], errorPanels[],
//     failedRequests[], screenshot, finalUrl, title }
//
// "ok" is false if any uncaught page error, console error, or ErrorPanel
// crash marker was seen. Failed requests are reported but don't flip ok
// (wallet-gated reads legitimately fail with no connected account).

import { chromium } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const baseUrl = process.env.QA_BASE_URL ?? 'http://localhost:5173'
const route = process.argv[2] ?? '/app'
const theme = process.argv[3] ?? null

const outDir = path.resolve(__dirname, '..', '..', '.qa', 'screenshots')
await mkdir(outDir, { recursive: true })
const slug = route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root'

const consoleErrors = []
const networkNoise = []
const pageErrors = []
const errorPanels = []
const failedRequests = []

import { existsSync } from 'node:fs'
const launchOpts = { headless: true }
const FALLBACK_CHROMIUM =
  '/home/node/.cache/ms-playwright/chromium_headless_shell-1223/chrome-linux/headless_shell'
const chromiumPath = process.env.CHROMIUM_PATH ?? (existsSync(FALLBACK_CHROMIUM) ? FALLBACK_CHROMIUM : null)
if (chromiumPath) launchOpts.executablePath = chromiumPath

const browser = await chromium.launch(launchOpts)
let result = { route, ok: false }
try {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  const page = await ctx.newPage()

  // Sandbox has no external network: requests to public mainnet RPCs and
  // any CORS/resource-load failures are ENVIRONMENT NOISE, not app bugs.
  const isNoise = (t) =>
    /eth\.merkle\.io|cloudflare-eth|ankr\.com|llamarpc|publicnode|drpc\.org/.test(t) ||
    /Access to fetch .* blocked by CORS/.test(t) ||
    /Failed to load resource: net::ERR_(FAILED|ABORTED|CONNECTION|NAME_NOT_RESOLVED)/.test(t) ||
    /ERR_NETWORK|fetch failed|NetworkError/.test(t)

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (isNoise(text)) networkNoise.push(text)
    else consoleErrors.push(text)
    const m = text.match(/\[ErrorPanel:([^\]]+)\]/)
    if (m) errorPanels.push(m[1])
  })
  page.on('pageerror', (err) => pageErrors.push(String(err?.message ?? err)))
  page.on('requestfailed', (req) =>
    failedRequests.push({ url: req.url(), method: req.method(), failure: req.failure()?.errorText }),
  )
  page.on('response', (res) => {
    if (res.status() >= 400) failedRequests.push({ url: res.url(), status: res.status() })
  })

  const resp = await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle', timeout: 30000 }).catch((e) => {
    pageErrors.push(`navigation: ${e.message}`)
    return null
  })
  // Let lazy panels / charts / sigma settle and any deferred render crash surface.
  await page.waitForTimeout(1500)
  if (theme) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
    await page.waitForTimeout(300)
  }

  const title = await page.title().catch(() => null)
  const finalUrl = page.url()
  const screenshot = path.join(outDir, `${slug}${theme ? '_' + theme : ''}.png`)
  await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {})

  result = {
    route,
    ok: pageErrors.length === 0 && consoleErrors.length === 0 && errorPanels.length === 0,
    httpStatus: resp?.status() ?? null,
    finalUrl,
    title,
    consoleErrors,
    pageErrors,
    errorPanels,
    failedRequests: failedRequests.filter((r) => !isNoise(r.url ?? '')),
    networkNoiseCount: networkNoise.length,
    screenshot,
  }
} finally {
  await browser.close()
}
process.stdout.write(JSON.stringify(result, null, 2) + '\n')
