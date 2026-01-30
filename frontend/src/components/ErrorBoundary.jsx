import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error) {
    // Surface errors in dev console to avoid silent white screens.
    console.error("App crashed:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-200 flex items-center justify-center p-6">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 max-w-md w-full text-sm text-slate-700">
            <div className="text-base font-semibold text-slate-800 mb-2">
              App crashed
            </div>
            <div className="text-slate-600">
              {this.state.error?.message || "Error inesperado."}
            </div>
            <div className="mt-3 text-xs text-slate-500">
              Revisá la consola para más detalles.
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
