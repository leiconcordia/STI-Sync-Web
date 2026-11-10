import React from 'react';
import { useNavigate } from 'react-router';
import { Layers } from 'lucide-react';

export function WorkspaceSwitcher() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate('/portal/workspaces')} className="inline-flex items-center gap-2 rounded-lg border border-current/20 px-3 py-2 text-xs font-semibold hover:opacity-80"><Layers className="h-4 w-4" />Switch Workspace</button>;
}
