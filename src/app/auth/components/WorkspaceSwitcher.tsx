import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Layers } from 'lucide-react';
import {
  hasMultiplePortalKinds,
  loadPortalWorkspaces,
  readStoredPortalWorkspaces,
} from '../services/portal-workspace.service';

export function WorkspaceSwitcher() {
  const navigate = useNavigate();
  const [canSwitchPortal, setCanSwitchPortal] = useState(() =>
    hasMultiplePortalKinds(readStoredPortalWorkspaces())
  );

  useEffect(() => {
    let active = true;
    loadPortalWorkspaces()
      .then((choices) => {
        if (active) setCanSwitchPortal(hasMultiplePortalKinds(choices));
      })
      .catch(() => {
        // Keep stored evaluation if background refresh fails
      });
    return () => {
      active = false;
    };
  }, []);

  if (!canSwitchPortal) return null;

  return (
    <button
      type="button"
      onClick={() => navigate('/portal/workspaces')}
      className="inline-flex items-center gap-2 rounded-lg border border-current/20 px-3 py-2 text-xs font-semibold hover:opacity-80"
    >
      <Layers className="h-4 w-4" />
      Switch Workspace
    </button>
  );
}
