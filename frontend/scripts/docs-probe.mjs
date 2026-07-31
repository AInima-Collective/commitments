// Smoke test: visit /app/docs pages in headless Chromium and check key content.
import { chromium } from '@playwright/test'

const base = process.argv[2] ?? 'http://localhost:5174'
const launchOpts = { headless: true }
if (process.env.CHROMIUM_PATH) launchOpts.executablePath = process.env.CHROMIUM_PATH

const cases = [
  { url: '/app/docs', expect: ['Commitments', 'Overview'] },
  { url: '/app/docs/standards', expect: ['Standards family', 'Core Commitments'] },
  { url: '/app/docs/standards/ERC-COMMITMENTS', expect: ['Commitments', 'Abstract'] },
  { url: '/app/docs/protocol', expect: ['Full Protocol Docs', 'Architecture'] },
  { url: '/app/docs/protocol/architecture/overview', expect: ['Architecture'] },
  {
    url: '/app/docs/protocol/reference/contracts/periphery/vaults/CommitmentsVault',
    expect: ['CommitmentsVault', 'generated'],
  },
  { url: '/app/docs/protocol/guides/depositor', expect: ['Depositor'] },
]

const browser = await chromium.launch(launchOpts)
const context = await browser.newContext()
const page = await context.newPage()

let failures = 0
for (const c of cases) {
  const url = base + c.url
  page.removeAllListeners('console')
  const errors = []
  page.on('pageerror', (err) => errors.push(`page:${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console:${msg.text()}`)
  })
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
    const text = await page.evaluate(() => document.body.innerText)
    const missing = c.expect.filter((s) => !text.toLowerCase().includes(s.toLowerCase()))
    if (missing.length || errors.length) {
      failures += 1
      console.log(`FAIL ${c.url}`)
      if (missing.length) console.log(`  missing: ${missing.join(', ')}`)
      if (errors.length) console.log(`  errors:\n    ${errors.join('\n    ')}`)
      console.log(`  body[0..400]: ${text.slice(0, 400).replace(/\n/g, ' ')}`)
    } else {
      console.log(`PASS ${c.url}`)
    }
  } catch (e) {
    failures += 1
    console.log(`FAIL ${c.url} — ${e instanceof Error ? e.message : e}`)
  }
}

await browser.close()
process.exit(failures ? 1 : 0)
