import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBrandStore } from '@/store/brandStore';
import { HexColorPicker } from 'react-colorful';
import { useState } from 'react';
import { Switch } from '@/components/ui/switch';

const FONT_OPTIONS = ['Bebas Neue', 'Oswald', 'Inter', 'Montserrat', 'Playfair Display', 'Anton', 'Archivo Black'];

interface Props { open: boolean; onOpenChange: (o: boolean) => void }

export const BrandKitDialog = ({ open, onOpenChange }: Props) => {
  const brandKit = useBrandStore((s) => s.brandKit);
  const setBrandKit = useBrandStore((s) => s.setBrandKit);
  const [editingColor, setEditingColor] = useState<'primary' | 'accent' | null>(null);

  const onLogo = async (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setBrandKit({ logo: reader.result as string });
    reader.readAsDataURL(file);
  };

  const onOemLogo = async (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setBrandKit({ oemLogo: reader.result as string });
    reader.readAsDataURL(file);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Brand Kit</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Dealership name</Label>
            <Input value={brandKit.dealershipName} onChange={(e) => setBrandKit({ dealershipName: e.target.value })} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Phone</Label>
              <Input value={brandKit.phone} onChange={(e) => setBrandKit({ phone: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Address</Label>
              <Input value={brandKit.address} onChange={(e) => setBrandKit({ address: e.target.value })} className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Dealer logo — top-left (PNG)</Label>
            <div className="mt-1 flex items-center gap-2">
              {brandKit.logo && <img src={brandKit.logo} alt="logo" className="w-12 h-12 object-contain border rounded bg-white" />}
              <Input type="file" accept="image/png" onChange={(e) => e.target.files?.[0] && onLogo(e.target.files[0])} />
            </div>
          </div>
          <div>
            <Label className="text-xs">OEM logo — top-right (optional)</Label>
            <p className="text-[11px] text-neutral-500 mt-0.5">Only upload if you have rights to use the manufacturer's logo (authorized dealers).</p>
            <div className="mt-1 flex items-center gap-2">
              {brandKit.oemLogo && <img src={brandKit.oemLogo} alt="oem" className="w-12 h-12 object-contain border rounded bg-white" />}
              <Input type="file" accept="image/png" onChange={(e) => e.target.files?.[0] && onOemLogo(e.target.files[0])} />
              {brandKit.oemLogo && (
                <Button variant="ghost" size="sm" onClick={() => setBrandKit({ oemLogo: '' })}>Clear</Button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Primary</Label>
              <button onClick={() => setEditingColor(editingColor === 'primary' ? null : 'primary')} className="mt-1 w-full h-9 rounded border" style={{ background: brandKit.primaryHex }} />
              {editingColor === 'primary' && (
                <div className="mt-2"><HexColorPicker color={brandKit.primaryHex} onChange={(c) => setBrandKit({ primaryHex: c })} style={{ width: '100%' }} /></div>
              )}
            </div>
            <div>
              <Label className="text-xs">Accent</Label>
              <button onClick={() => setEditingColor(editingColor === 'accent' ? null : 'accent')} className="mt-1 w-full h-9 rounded border" style={{ background: brandKit.accentHex }} />
              {editingColor === 'accent' && (
                <div className="mt-2"><HexColorPicker color={brandKit.accentHex} onChange={(c) => setBrandKit({ accentHex: c })} style={{ width: '100%' }} /></div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Display font</Label>
              <select value={brandKit.displayFont} onChange={(e) => setBrandKit({ displayFont: e.target.value })} className="mt-1 w-full h-9 px-2 border rounded text-sm">
                {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Body font</Label>
              <select value={brandKit.bodyFont} onChange={(e) => setBrandKit({ bodyFont: e.target.value })} className="mt-1 w-full h-9 px-2 border rounded text-sm">
                {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wide">Footer details</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-600">Show footer strip</span>
                <Switch checked={brandKit.footerEnabled !== false} onCheckedChange={(v) => setBrandKit({ footerEnabled: v })} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input value={brandKit.phoneNumber} onChange={(e) => setBrandKit({ phoneNumber: e.target.value })} placeholder="+91 98765 43210" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Locations</Label>
              <Input value={brandKit.locations} onChange={(e) => setBrandKit({ locations: e.target.value })} placeholder="Andheri | Bandra | Powai" className="mt-1" />
              <p className="text-[11px] text-neutral-500 mt-0.5">Separate multiple locations with " | "</p>
            </div>
            <div>
              <Label className="text-xs">Social handle</Label>
              <Input value={brandKit.socialHandle} onChange={(e) => setBrandKit({ socialHandle: e.target.value })} placeholder="@apexmotors" className="mt-1" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};