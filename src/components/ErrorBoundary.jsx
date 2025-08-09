import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, err: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, err: error };
  }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary atrapó:', error, info);
    this.setState({ info });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, color: '#fff', maxWidth: 900 }}>
          <h2 style={{ marginBottom: 8 }}>Algo salió mal</h2>
          <div style={{ opacity: 0.9, fontFamily: 'monospace', fontSize: 13, whiteSpace: 'pre-wrap' }}>
            <strong>Mensaje:</strong> {this.state.err?.message || String(this.state.err)}
            {'\n\n'}
            <strong>Stack:</strong>{'\n'}{this.state.err?.stack}
            {'\n\n'}
            <strong>Componente:</strong>{'\n'}{this.state.info?.componentStack}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
