import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { installBigIntJsonSerialization } from './src/lib/bigintJson'

// Match the browser bootstrap so bigint JSON serialization behaves identically
// under test (react-query keys, indexer bodies). See src/lib/bigintJson.ts.
installBigIntJsonSerialization()

// sigma.js reaches for WebGL2RenderingContext at module load. Node doesn't
// have it; stub it so imports succeed — the pure graph-building code we test
// never actually touches WebGL.
const g = globalThis as Record<string, unknown>
if (typeof g.WebGL2RenderingContext === 'undefined') g.WebGL2RenderingContext = class {}
if (typeof g.WebGLRenderingContext === 'undefined') g.WebGLRenderingContext = class {}
// jsdom provides HTMLCanvasElement; only stub it when missing (e.g. node env).
if (typeof g.HTMLCanvasElement === 'undefined') g.HTMLCanvasElement = class {}

// @testing-library/react auto-cleanup only fires when vitest globals are
// enabled. Our config does not opt into globals, so wire cleanup manually so
// tests don't leak DOM between cases (which breaks getByRole singleton lookups).
afterEach(() => {
  cleanup()
})
