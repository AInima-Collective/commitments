import { Component, type ReactNode } from 'react'
import { Button } from './Button'
import { ErrorBlock } from './ErrorBlock'

interface ErrorPanelProps {
  panelName: string
  children: ReactNode
}

interface ErrorPanelState {
  hasError: boolean
  error: Error | null
}

export class ErrorPanel extends Component<ErrorPanelProps, ErrorPanelState> {
  constructor(props: ErrorPanelProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorPanelState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error(`[ErrorPanel:${this.props.panelName}]`, error, info)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorBlock
          title={`Could not load ${this.props.panelName}`}
          message={this.state.error?.message}
          actions={
            <Button size="sm" variant="ghost" onClick={this.handleRetry}>
              Retry
            </Button>
          }
        />
      )
    }

    return this.props.children
  }
}
