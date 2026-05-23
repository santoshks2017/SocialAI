import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { usePostStore } from '@/store/postStore';

export const ContextForm = () => {
  const context = usePostStore((s) => s.context);
  const setContext = usePostStore((s) => s.setContext);

  return (
    <div className="space-y-3 pt-2">
      <div>
        <Label className="text-xs font-medium">Car model</Label>
        <Input
          value={context.model}
          onChange={(e) => setContext({ model: e.target.value })}
          placeholder="e.g. Tata Sierra Adventure Edition"
          className="mt-1"
        />
      </div>
      <div>
        <Label className="text-xs font-medium">Post brief</Label>
        <Textarea
          value={context.brief}
          onChange={(e) => setContext({ brief: e.target.value.slice(0, 500) })}
          placeholder='Describe your post. e.g. "Diwali offer of ₹50,000 on the Sierra. Premium festive feel for families."'
          rows={5}
          className="mt-1 resize-none"
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          {context.brief.length}/500 — mention occasion, mood, offer, audience.
        </p>
      </div>
    </div>
  );
};