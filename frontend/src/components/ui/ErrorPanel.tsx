import { Component, type ReactNode } from 'react'

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
        <div box-="square" style={{ borderColor: 'var(--danger)', padding: '16px', margin: '16px' }}>
          <p style={{ color: 'var(--danger)', fontWeight: 600 }}>ERROR</p>
          <p style={{ color: 'var(--foreground0)' }}>
            Failed to load {this.props.panelName}.
          </p>
          {this.state.error && (
            <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
              {this.state.error.message}
            </p>
          )}
          <button onClick={this.handleRetry} style={{ marginTop: '8px' }}>
            [ RETRY ]
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
