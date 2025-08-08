import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, err: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, err: error };
  }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary atrapó:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, color: '#fff' }}>
          <h2>Algo salió mal</h2>
          <pre style={{ whiteSpace: 'pre-wrap', opacity: 0.8 }}>
            {String(this.state.err)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
