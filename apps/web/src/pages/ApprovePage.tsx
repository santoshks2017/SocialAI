import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CircleCheck, CircleX, LoaderCircle, ShieldCheck } from 'lucide-react';
import { ApiError } from '../services/api';
import { approvalService, type ApprovalPreview, type ApprovalResult } from '../services/approvals';
import { firstCreative } from '../utils/posts';

export default function ApprovePage() {
  const { token = '' } = useParams();
  const [data, setData] = useState<ApprovalPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState<'approve' | 'reject' | null>(null);
  const [result, setResult] = useState<ApprovalResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    approvalService.get(token)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(err instanceof ApiError ? err.message : 'This approval link is invalid or has expired.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  const decide = async (decision: 'approve' | 'reject') => {
    setActionError(null);
    setPending(decision);
    try {
      setResult(await approvalService.decide(token, decision, comment.trim()));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setPending(null);
    }
  };

  const image = data ? firstCreative(data.post.creative_urls) : null;
  const hashtags = (data?.post.caption_hashtags ?? []).map((t) => (t.startsWith('#') ? t : `#${t}`));

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm ring-1 ring-zinc-100 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-zinc-100">
          <ShieldCheck className="w-5 h-5 text-orange-500" />
          <span className="font-semibold text-zinc-900">Post approval</span>
        </div>
        <div className="p-5">
          {loading ? (
            <div className="flex items-center gap-2 text-zinc-500 py-10 justify-center">
              <LoaderCircle className="w-5 h-5 animate-spin" /> Loading…
            </div>
          ) : result ? (
            <div className="text-center py-8">
              {result.status === 'approved'
                ? <CircleCheck className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                : <CircleX className="w-12 h-12 text-amber-500 mx-auto mb-3" />}
              <p className="text-zinc-800 font-medium">{result.message}</p>
              <p className="text-zinc-500 text-sm mt-1">You can close this window.</p>
            </div>
          ) : error || !data ? (
            <div className="text-center py-8">
              <CircleX className="w-10 h-10 text-red-500 mx-auto mb-3" />
              <p className="text-zinc-700">{error ?? 'This approval link is invalid or has expired.'}</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-zinc-500 mb-3">
                <span className="font-medium text-zinc-700">{data.dealer_name}</span> submitted a post for your approval.
              </p>
              {image && <img src={image} alt="Creative preview" className="w-full rounded-xl ring-1 ring-zinc-100 mb-3 object-cover" />}
              {data.post.caption_text && <p className="text-sm text-zinc-700 whitespace-pre-wrap mb-2">{data.post.caption_text}</p>}
              {hashtags.length > 0 && <p className="text-sm text-orange-600 mb-3">{hashtags.join(' ')}</p>}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {data.post.platforms.map((p) => (
                  <span key={p} className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 capitalize">{p}</span>
                ))}
              </div>
              {data.actionable ? (
                <>
                  <label htmlFor="approval-comment" className="block text-xs font-medium text-zinc-500 mb-1.5">Feedback / comment (optional)</label>
                  <textarea
                    id="approval-comment"
                    rows={3}
                    maxLength={1000}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Add a note for the team — e.g. why you're rejecting, or any change requested."
                    className="w-full rounded-xl border border-zinc-200 p-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  />
                  {actionError && <p role="alert" className="text-sm text-red-600 mb-3">{actionError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => decide('reject')}
                      disabled={pending !== null}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-60 flex items-center justify-center gap-1.5"
                    >
                      {pending === 'reject' ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <CircleX className="w-4 h-4" />} Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => decide('approve')}
                      disabled={pending !== null}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 flex items-center justify-center gap-1.5"
                    >
                      {pending === 'approve' ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <CircleCheck className="w-4 h-4" />} Approve
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-center text-zinc-500 py-2">This post has already been actioned.</p>
              )}
              <p className="text-[11px] text-center text-zinc-400 mt-4">Approving marks this post ready to publish — it won't post automatically.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
