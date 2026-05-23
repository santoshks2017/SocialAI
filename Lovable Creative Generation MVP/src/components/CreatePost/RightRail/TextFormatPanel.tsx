import { useState, useEffect } from 'react';
import { HexColorPicker } from 'react-colorful';
import { Italic, Underline, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import * as fabric from 'fabric';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePostStore } from '@/store/postStore';
import { loadGoogleFont, GOOGLE_FONTS } from '@/lib/fonts';

export const TextFormatPanel = () => {
  const selectedObject: any = usePostStore((s) => s.selectedObject);
  const [color, setColor] = useState('#FFFFFF');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [, force] = useState(0);

  const isText = selectedObject?.type === 'textbox' || selectedObject?.type === 'i-text' || selectedObject?.type === 'text';

  useEffect(() => {
    if (isText && selectedObject?.fill) setColor(selectedObject.fill as string);
  }, [selectedObject, isText]);

  if (!isText) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Select a text layer on the canvas to edit its formatting.
      </div>
    );
  }

  const update = (props: Record<string, any>) => {
    selectedObject.set(props);
    selectedObject.canvas?.requestRenderAll();
    force((n) => n + 1);
  };

  const setFont = (font: string) => { loadGoogleFont(font).then(() => update({ fontFamily: font })); };

  const togglePill = (on: boolean) => {
    update({ backgroundColor: on ? 'rgba(232, 93, 4, 0.85)' : '' });
  };
  const toggleShadow = (on: boolean) => {
    update({
      shadow: on
        ? new fabric.Shadow({ color: 'rgba(0,0,0,0.45)', offsetX: 0, offsetY: 4, blur: 12 })
        : null,
    });
  };

  return (
    <div className="p-5 space-y-5">
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Font family</Label>
        <Select value={selectedObject.fontFamily ?? 'Inter'} onValueChange={setFont}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {GOOGLE_FONTS.map((f) => (
              <SelectItem key={f} value={f} style={{ fontFamily: f }}>{f}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
          Size — {Math.round(selectedObject.fontSize ?? 48)}px
        </Label>
        <Slider min={16} max={140} step={1}
          value={[selectedObject.fontSize ?? 48]}
          onValueChange={([v]) => update({ fontSize: v })} />
      </div>

      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Weight</Label>
        <Tabs value={String(selectedObject.fontWeight ?? 'normal')}
          onValueChange={(v) => update({ fontWeight: v })}>
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="normal">Regular</TabsTrigger>
            <TabsTrigger value="500">Medium</TabsTrigger>
            <TabsTrigger value="bold">Bold</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex gap-2">
        <Button size="icon" variant={selectedObject.fontStyle === 'italic' ? 'default' : 'outline'}
          onClick={() => update({ fontStyle: selectedObject.fontStyle === 'italic' ? 'normal' : 'italic' })}>
          <Italic className="w-4 h-4" />
        </Button>
        <Button size="icon" variant={selectedObject.underline ? 'default' : 'outline'}
          onClick={() => update({ underline: !selectedObject.underline })}>
          <Underline className="w-4 h-4" />
        </Button>
      </div>

      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Alignment</Label>
        <div className="flex gap-2">
          {(['left', 'center', 'right'] as const).map((a) => {
            const Icon = a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight;
            return (
              <Button key={a} size="icon"
                variant={selectedObject.textAlign === a ? 'default' : 'outline'}
                onClick={() => update({ textAlign: a })}>
                <Icon className="w-4 h-4" />
              </Button>
            );
          })}
        </div>
      </div>

      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Color</Label>
        <button
          className="w-full h-10 rounded-lg border border-border flex items-center px-3 gap-3"
          onClick={() => setShowColorPicker(!showColorPicker)}>
          <span className="w-6 h-6 rounded border border-border" style={{ background: color }} />
          <span className="text-sm font-mono">{color}</span>
        </button>
        {showColorPicker && (
          <div className="mt-2">
            <HexColorPicker color={color} onChange={(c) => { setColor(c); update({ fill: c }); }} />
          </div>
        )}
      </div>

      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
          Letter spacing — {((selectedObject.charSpacing ?? 0) / 10).toFixed(1)}
        </Label>
        <Slider min={-50} max={300} step={10}
          value={[selectedObject.charSpacing ?? 0]}
          onValueChange={([v]) => update({ charSpacing: v })} />
      </div>

      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
          Line height — {(selectedObject.lineHeight ?? 1.2).toFixed(2)}
        </Label>
        <Slider min={0.8} max={2.4} step={0.05}
          value={[selectedObject.lineHeight ?? 1.2]}
          onValueChange={([v]) => update({ lineHeight: v })} />
      </div>

      <div className="flex items-center justify-between pt-1">
        <Label htmlFor="shadow" className="text-xs font-medium text-muted-foreground">Text shadow</Label>
        <Switch id="shadow" checked={!!selectedObject.shadow} onCheckedChange={toggleShadow} />
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor="pill" className="text-xs font-medium text-muted-foreground">Background pill</Label>
        <Switch id="pill" checked={!!selectedObject.backgroundColor} onCheckedChange={togglePill} />
      </div>
    </div>
  );
};
