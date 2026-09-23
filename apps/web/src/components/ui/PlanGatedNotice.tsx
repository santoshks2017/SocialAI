import { Link } from 'react-router-dom';
import { Lock, ArrowRight } from 'lucide-react';

interface PlanGatedNoticeProps {
  feature: string;
  message?: string;
}

// Shown in place of a page when the API answers 403 PLAN_GATED.
export function PlanGatedNotice({ feature, message }: PlanGatedNoticeProps) {
  return (
    <div className="max-w-xl mx-auto mt-10 bg-white border border-orange-200 rounded-2xl shadow-sm p-8 text-center">
      <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center">
        <Lock className="w-5 h-5 text-orange-500" />
      </div>
      <h2 className="text-lg font-bold text-slate-900">{feature} isn't included in your plan</h2>
      <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
        {message || `Upgrade to the Growth or Enterprise plan to use ${feature}.`}
      </p>
      <Link
        to="/billing"
        className="inline-flex items-center gap-1.5 mt-5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm"
      >
        View plans <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}
