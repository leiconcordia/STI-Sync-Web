import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Award, Plus, ArrowLeft } from 'lucide-react';
import { CertificateLibrary, TemplateEditor } from '../../../modules/certificates';

export default function CertificateSettings() {
  const navigate = useNavigate();
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [editTemplateId, setEditTemplateId] = useState<string>('');

  const handleCreateCertificate = () => {
    setEditTemplateId('');
    setView('editor');
  };

  const handleEditTemplate = (id: string) => {
    setEditTemplateId(id);
    setView('editor');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-[#001A4D]">
            {view === 'editor'
              ? editTemplateId
                ? 'Edit Certificate Template'
                : 'Create Certificate Template'
              : 'Certificate List & Templates'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {view === 'editor'
              ? 'Design your certificate layout, paper size, text placeholders, and official signatories.'
              : 'Create, edit, approve, and publish certificate templates available in the Certificates module.'}
          </p>
        </div>

        {view === 'list' ? (
          <button
            type="button"
            onClick={handleCreateCertificate}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#001A4D] text-[#FFD41C] font-semibold text-sm rounded-xl hover:bg-[#0E4EBD] transition-colors cursor-pointer shrink-0 shadow-xs"
          >
            <Award className="w-4 h-4" />
            <Plus className="w-3.5 h-3.5" />
            Create Certificate
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setView('list')}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-[#001A4D] font-semibold text-sm rounded-xl hover:bg-gray-50 transition-colors cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Certificate List
          </button>
        )}
      </div>

      {view === 'list' ? (
        <CertificateLibrary
          isAdmin={true}
          onEditTemplate={handleEditTemplate}
          onCreateCertificate={handleCreateCertificate}
          onGenerateCertificates={(eventId) =>
            navigate(`/home/certificates?eventId=${encodeURIComponent(eventId)}`)
          }
        />
      ) : (
        <TemplateEditor
          isAdmin={true}
          templateId={editTemplateId}
          onSave={() => setView('list')}
        />
      )}
    </div>
  );
}
