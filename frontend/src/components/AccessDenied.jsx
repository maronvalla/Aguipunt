export default function AccessDenied() {
  return (
    <div className="min-h-screen bg-slate-200 flex items-center justify-center p-6">
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 max-w-md w-full text-sm text-slate-700">
        <div className="text-base font-semibold text-slate-800 mb-2">
          Acceso denegado
        </div>
        <div className="text-slate-600">
          No tenés permisos para ver esta sección.
        </div>
        <div className="mt-3 text-xs text-slate-500">
          Contactá a un administrador si necesitás acceso.
        </div>
      </div>
    </div>
  );
}
