import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-zinc-50 px-4 py-16 text-zinc-900">
          <div className="mx-auto max-w-lg rounded-2xl border border-red-200 bg-red-50 p-6">
            <h1 className="font-display text-lg font-bold text-red-900">Error al cargar la aplicación</h1>
            <p className="mt-2 text-sm text-red-800">
              Revisa la consola del navegador (F12 → Consola) para el detalle técnico.
            </p>
            <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-white/80 p-3 text-xs text-red-950">
              {this.state.error?.message || String(this.state.error)}
            </pre>
            <button
              type="button"
              className="mt-4 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              onClick={() => window.location.reload()}
            >
              Recargar página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
