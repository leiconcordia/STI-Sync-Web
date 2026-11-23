import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Settings, ChevronRight } from "lucide-react";
import { CertificateDashboard, GenerateCertificates } from "../../modules/certificates";

type Screen = "dashboard" | "generate";

export function Certificates() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [activeEventId, setActiveEventId] = useState<string>("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const eventIdParam = searchParams.get('eventId');

  useEffect(() => {
    if (eventIdParam) {
      setActiveEventId(eventIdParam);
      setScreen("generate");
    }
  }, [eventIdParam]);

  const handleGenerate = (eventId: string, templateId?: string) => {
    setActiveEventId(eventId);
    setSelectedTemplateId(templateId || "");
    setScreen("generate");
  };

  const handleBackToDashboard = () => {
    setActiveEventId("");
    setSelectedTemplateId("");
    if (searchParams.has('eventId')) {
      const next = new URLSearchParams(searchParams);
      next.delete('eventId');
      setSearchParams(next, { replace: true });
    }
    setScreen("dashboard");
  };

  return (
    <div className="p-6 space-y-5">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          {screen === "dashboard" ? (
            <p className="text-gray-500 text-sm font-medium">
              Choose from ready-made templates and issue verified certificates for concluded events
            </p>
          ) : (
            <>
              <h2 className="text-[#001A4D] font-bold text-xl">Generate Certificates</h2>
              <nav className="flex items-center gap-1.5 mt-1">
                <button
                  onClick={handleBackToDashboard}
                  className="text-xs text-[#9E9E9E] hover:text-[#001A4D] transition-colors cursor-pointer"
                >
                  Certificates
                </button>
                <ChevronRight className="w-3 h-3 text-[#9E9E9E]" />
                <span className="text-xs text-[#001A4D] font-semibold">Generate Certificates</span>
              </nav>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => navigate('/home/settings?section=certificates')}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 bg-white text-[#001A4D] font-semibold text-xs rounded-xl hover:bg-gray-50 transition-colors cursor-pointer shrink-0 shadow-2xs"
        >
          <Settings className="w-3.5 h-3.5 text-[#0E4EBD]" />
          Manage Templates in Settings
        </button>
      </div>

      {/* Screen Switcher */}
      {screen === "dashboard" && (
        <CertificateDashboard
          isAdmin={true}
          onGenerate={handleGenerate}
          onManageTemplatesInSettings={() => navigate('/home/settings?section=certificates')}
        />
      )}
      {screen === "generate" && (
        <GenerateCertificates
          isAdmin={true}
          eventId={activeEventId}
          initialTemplateId={selectedTemplateId}
          onBack={handleBackToDashboard}
        />
      )}
    </div>
  );
}
