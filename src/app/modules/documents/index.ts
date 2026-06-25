// ─── Documents Module — Public Barrel Exports ─────────────────────────────────

// Types
export type { DocumentCategoryDocument, DocumentSettingsDocument, DocumentDocument, DocFileType, DocStatus, DocDistribution } from './types/document.types';
export { DEFAULT_DOCUMENT_SETTINGS, inferFileType, DOCUMENT_ACCEPTED_TYPES, DOCUMENT_MAX_BYTES } from './types/document.types';

// Hooks
export { useDocumentCategories } from './hooks/useDocumentCategories';
export { useDocumentSettings } from './hooks/useDocumentSettings';
export { useIncomingDocuments, useSentDocuments, useOfficerSubmissions, useOfficerInbox } from './hooks/useDocumentStream';

// Services — Document Categories
export {
  getDocumentCategories,
  createDocumentCategory,
  updateDocumentCategory,
  deleteDocumentCategory,
} from './services/document_category.service';

// Services — Document Settings
export {
  getDocumentSettings,
  saveDocumentSettings,
} from './services/document_settings.service';

// Services — Documents (EDMS core)
export {
  createDocument,
  updateDocument,
  reviewDocument,
  markDocumentRead,
  getNextReferenceNumber,
} from './services/document.service';

// Components
export { DocumentPreviewModal } from './components/DocumentPreviewModal';
