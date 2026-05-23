import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';
import { usePostStore } from '@/store/postStore';

export const GenerateButton = () => {
  const start = usePostStore((s) => s.startGeneration);
  const isLoading = usePostStore((s) => s.isLoading);
  const carLibrary = usePostStore((s) => s.carLibrary);
  const ctx = usePostStore((s) => s.context);
  const disabled = isLoading || carLibrary.length === 0 || !ctx.model || ctx.brief.length < 20;

  return (
    <Button
      onClick={() => start()}
      disabled={disabled}
      className="w-full h-12 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-semibold shadow-lg"
    >
      {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
      Generate post
    </Button>
  );
};