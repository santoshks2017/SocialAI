import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TriangleAlert, X } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { isGlobalOwner } from '../../lib/permissions';
import { disconnectedPlatformNames, disconnectedVerb } from '../../utils/disconnectedPlatforms';

export function DisconnectedBanner() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const skip = !user || isGlobalOwner(user);
  const [names, setNames] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (skip) return;
    api.get<{ platforms?: Array<{ platform: string; needs_reconnect?: boolean }> }>('/platforms')
      .then((res) => setNames(disconnectedPlatformNames(res.platforms ?? [])))
      .catch(() => setNames([]));
  }, [skip]);

  if (skip || dismissed || names.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-b border-red-200 text-red-800">
      <TriangleAlert className="w-4 h-4 flex-shrink-0" />
      <p className="text-sm flex-1 min-w-0">
        <span className="font-semibold">{names.join(', ')}</span>{' '}{disconnectedVerb(names.length)}{' disconnected — reconnect to keep publishing and review sync running.'}
      </p>
      <button onClick={() => navigate('/accounts')} className="text-sm font-semibold underline hover:no-underline flex-shrink-0">Reconnect</button>
      <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="flex-shrink-0 p-1 hover:bg-red-100 rounded">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
