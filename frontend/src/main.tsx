import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { wagmiConfig } from './config/wagmi'
import { router } from './router'
import { ThemeProvider, ToastProvider } from './components/ui'
import { installBigIntJsonSerialization } from './lib/bigintJson'
import './index.css'

// Install the global BigInt JSON serialization before any render — see
// lib/bigintJson.ts for why this app-wide prototype patch is required.
installBigIntJsonSerialization()

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <WagmiProvider config={wagmiConfig}>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </WagmiProvider>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
)
