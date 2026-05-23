import { Button } from '@/components/ui/button';
import { useBrandStore } from '@/store/brandStore';
import { Pencil } from 'lucide-react';

interface Props { onEdit: () => void }

export const BrandKitSummary = ({ onEdit }: Props) => {
  const brandKit = useBrandStore((s) => s.brandKit);
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-neutral-700">Brand Kit</div>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onEdit}>
          <Pencil className="w-3 h-3 mr-1" /> Edit
        </Button>
      </div>
      <div className="flex items-center gap-2">
        {brandKit.logo ? (
          <img src={brandKit.logo} alt="logo" className="w-8 h-8 object-contain rounded bg-white border" />
        ) : (
          <div className="w-8 h-8 rounded bg-white border border-dashed flex items-center justify-center text-[9px] text-neutral-400">LOGO</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-neutral-900 truncate">{brandKit.dealershipName}</div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="w-3 h-3 rounded" style={{ background: brandKit.primaryHex }} />
            <span className="w-3 h-3 rounded" style={{ background: brandKit.accentHex }} />
            <span className="text-[10px] text-neutral-500 ml-1 truncate">{brandKit.displayFont} · {brandKit.bodyFont}</span>
          </div>
        </div>
      </div>
    </div>
  );
};