/**
 * src/app/modules/signatories/hooks/useSignatoryLabelsStream.ts
 *
 * Real-time subscription hook for institutional signatory document labels.
 */

import { useState, useEffect } from 'react';
import { subscribeToSignatoryLabels } from '../services/signatory-label.service';
import {
  DEFAULT_SIGNATORY_LABELS,
  type SignatoryLabelDocument,
} from '../types/signatory-label.types';

export function useSignatoryLabelsStream() {
  const [labels, setLabels] = useState<SignatoryLabelDocument[]>(() =>
    DEFAULT_SIGNATORY_LABELS.map((item, idx) => ({
      id: `default_${idx + 1}`,
      ...item,
    }))
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    try {
      const unsubscribe = subscribeToSignatoryLabels((updatedLabels) => {
        setLabels(updatedLabels);
        setLoading(false);
      });
      return () => unsubscribe();
    } catch (err: any) {
      console.error('[useSignatoryLabelsStream] Error subscribing to signatory labels:', err);
      setError(err);
      setLoading(false);
    }
  }, []);

  const activeLabels = labels.filter((l) => l.isActive);

  return { labels, activeLabels, loading, error };
}

