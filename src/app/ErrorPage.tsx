import { useRouteError, useNavigate } from "react-router";

export default function ErrorPage() {
  const error = useRouteError() as any;
  const navigate = useNavigate();

  console.error('[ErrorPage caught route error]:', error);

  const errorMessage =
    error?.message ||
    error?.statusText ||
    (typeof error?.data === 'string' ? error.data : error?.data?.message) ||
    (typeof error === 'string' ? error : 'An unexpected application error occurred.');

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="text-center max-w-xl w-full bg-white p-8 rounded-2xl shadow-lg border border-slate-200">
        <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-2xl flex items-center justify-center">
          <span className="text-red-600 text-3xl font-black">!</span>
        </div>
        <h1 className="text-[#001A4D] text-2xl font-bold mb-2">Oops!</h1>
        <p className="text-slate-500 text-sm mb-4">Sorry, an unexpected error has occurred.</p>

        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-left mb-6 text-xs text-red-900 overflow-x-auto">
          <strong className="block font-bold mb-1 text-red-800">Error Details:</strong>
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
            {errorMessage}
          </pre>
          {error?.stack && (
            <details className="mt-3 text-[10px] text-red-700">
              <summary className="cursor-pointer font-semibold underline">View Call Stack</summary>
              <pre className="mt-2 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto bg-white/60 p-2 rounded border border-red-200">
                {error.stack}
              </pre>
            </details>
          )}
        </div>

        <div className="flex justify-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold text-xs transition-colors"
          >
            Reload Page
          </button>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 bg-[#001A4D] hover:bg-[#0E4EBD] text-white rounded-xl font-bold text-xs transition-colors"
          >
            Go to Home
          </button>
        </div>
      </div>
    </div>
  );
}
