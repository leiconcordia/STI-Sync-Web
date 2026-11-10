import { documentKind } from '../../modules/documents/utils/document-storage';
import { Navigate, useNavigate, useParams } from 'react-router';
import { Loader2 } from 'lucide-react';
import { useDocument } from '../../modules/documents/hooks/useDocumentStream';
import { reviewDocument } from '../../modules/documents/services/document.service';
import { DocumentPreviewModal } from '../../modules/documents/components/DocumentPreviewModal';

export function AdminDocumentReview() {
  const navigate = useNavigate();
  const { docId } = useParams();
  const { data: document, loading, error } = useDocument(docId);
  const close = () => navigate('/home/documents?view=incoming');
  if (loading) return <div className="flex justify-center p-16"><Loader2 className="animate-spin" aria-label="Loading document" /></div>;
  if (!document || error) return <div role="alert" className="p-8 text-red-600">{error?.message || 'Document not found.'}<button onClick={close} className="ml-3 underline">Back to documents</button></div>;
  const kind = documentKind(document);
  if (kind !== 'general') return <Navigate replace to={`/home/reports?reportStorage=${kind}&reportId=${encodeURIComponent(document.id)}`} />;
  const review = async (status: 'Approved' | 'Rejected' | 'Returned', remarks: string) => {
    await reviewDocument(document.id, status, '', remarks || null);
    close();
  };
  return <DocumentPreviewModal doc={document} isAdmin onClose={close} onApprove={(remarks) => review('Approved', remarks)} onReject={(remarks) => review('Rejected', remarks)} onReturn={(remarks) => review('Returned', remarks)} />;
}
