import { useRouteError, useNavigate } from "react-router";

export default function ErrorPage() {
  const error = useRouteError() as any;
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 mx-auto mb-6 bg-red-100 rounded-2xl flex items-center justify-center">
          <span className="text-red-600 text-4xl">!</span>
        </div>
        <h1 className="text-[#001A4D] text-[32px] font-bold mb-2">Oops!</h1>
        <p className="text-[#9E9E9E] text-[16px] mb-4">Sorry, an unexpected error has occurred.</p>
        {error?.statusText || error?.message ? (
          <p className="text-[#9E9E9E] text-[14px] italic mb-8">
            {error.statusText || error.message}
          </p>
        ) : null}
        <button
          onClick={() => navigate('/')}
          className="px-6 py-3 bg-[#001A4D] text-white rounded-lg font-medium hover:bg-[#0C3C8A] transition-colors"
        >
          Go to Home
        </button>
      </div>
    </div>
  );
}
