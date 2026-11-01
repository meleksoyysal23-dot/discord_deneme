/**
 * ErrorBoundary Component
 * React error boundary for graceful error handling
 */

import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null 
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-800 rounded-lg shadow-lg p-6 border border-red-500/20">
            <div className="text-center">
              <div className="text-6xl mb-4">⚠️</div>
              <h1 className="text-2xl font-bold text-white mb-2">
                Bir şeyler ters gitti
              </h1>
              <p className="text-slate-400 mb-6">
                Uygulama beklenmeyen bir hatayla karşılaştı.
              </p>
              
              {this.state.error && (
                <div className="bg-slate-900 rounded-lg p-4 mb-6 text-left">
                  <p className="text-xs text-slate-500 mb-2 font-mono">Hata Detayı:</p>
                  <p className="text-sm text-red-400 font-mono break-words">
                    {this.state.error.toString()}
                  </p>
                </div>
              )}
              
              <div className="flex gap-3">
                <button
                  onClick={this.handleReset}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  Tekrar Dene
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
                >
                  Sayfayı Yenile
                </button>
              </div>
              
              <p className="text-xs text-slate-500 mt-6">
                Sorun devam ederse, lütfen tarayıcı konsolunu kontrol edin.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}