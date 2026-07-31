import { useEffect } from 'react'
import {
  ApplicationsSection,
  ClosingSection,
  ComposeSection,
  Hero,
  LandingShell,
  PrimitiveSection,
} from '../components/landing'
import '../styles/landing.css'

export default function Landing() {
  useEffect(() => {
    const prev = document.title
    document.title = 'Commitments — composable enforceable agreements'
    return () => {
      document.title = prev
    }
  }, [])

  return (
    <LandingShell>
      <Hero />
      <PrimitiveSection />
      <ComposeSection />
      <ApplicationsSection />
      <ClosingSection />
    </LandingShell>
  )
}
