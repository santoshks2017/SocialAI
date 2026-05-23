import { useState, useRef } from 'react';
import * as fabric from 'fabric';
import { CanvasToolbar } from './CenterStage/CanvasToolbar';
import { CarUploader } from './LeftRail/CarUploader';
import { ContextForm } from './LeftRail/ContextForm';
import { GenerateButton } from './LeftRail/GenerateButton';
import { BrandKitSummary } from './LeftRail/BrandKitSummary';
import { Canvas } from './CenterStage/Canvas';
import { VariantPicker } from './RightRail/VariantPicker';
import { TextFormatPanel } from './RightRail/TextFormatPanel';
import { BadgeFormatPanel } from './RightRail/BadgeFormatPanel';
import { BrandKitDialog } from './Modals/BrandKitDialog';
import { ExportDialog } from './Modals/ExportDialog';
import { Button } from '@/components/ui/button';
import { Loader2, Download, Sparkles } from 'lucide-react';
import { usePostStore } from '@/store/postStore';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export const CreatePostLayout = () => {
  const [brandOpen, setBrandOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const canvasRef = useRef<fabric.Canvas | null>(null);
  const isLoading = usePostStore((s) => s.isLoading);
  const loadingMessage = usePostStore((s) => s.loadingMessage);
  const sceneVariants = usePostStore((s) => s.sceneVariants);
  const getDimensions = usePostStore((s) => s.getDimensions);
  const aspectRatio = usePostStore((s) => s.aspectRatio);
  const dims = getDimensions();
  const [, setTick] = useState(0);
  const selectedObject = usePostStore((s) => s.selectedObject);
  const isBadge = selectedObject && (selectedObject as any).id?.startsWith('offer-badge');

  return (
    <div className="h-screen w-screen flex flex-col bg-neutral-100 overflow-hidden">
      {/* Top bar */}
      <header className="h-14 px-5 border-b border-neutral-200 bg-white flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <h1 className="font-semibold text-neutral-900" style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.05em' }}>APEX STUDIO</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setBrandOpen(true)}>Brand Kit</Button>
          <Button onClick={() => setExportOpen(true)} disabled={sceneVariants.length === 0} className="bg-neutral-900 hover:bg-neutral-800 text-white">
            <Download className="w-4 h-4 mr-2" /> Export
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left rail */}
        <aside className="w-72 border-r border-neutral-200 bg-white p-4 overflow-y-auto space-y-4 flex-shrink-0">
          <BrandKitSummary onEdit={() => setBrandOpen(true)} />
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-700">Car library</h2>
            <CarUploader />
          </section>
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-700">Brief</h2>
            <ContextForm />
          </section>
          <GenerateButton />
        </aside>

        {/* Center stage */}
        <main className="flex-1 relative bg-neutral-200 flex flex-col">
          <div className="px-4 pt-3">
            <CanvasToolbar canvas={canvasRef.current} />
          </div>
          <Canvas
            key={aspectRatio}
            width={dims.width}
            height={dims.height}
            onCanvasReady={(c) => { canvasRef.current = c; setTick((n) => n + 1); }}
          />
          {isLoading && (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
              <div className="bg-white rounded-xl shadow-2xl px-6 py-5 flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
                <span className="text-sm font-medium text-neutral-800">{loadingMessage || 'Working...'}</span>
              </div>
            </div>
          )}
        </main>

        {/* Right rail */}
        <aside className="w-80 border-l border-neutral-200 bg-white flex flex-col flex-shrink-0">
          <Tabs defaultValue="variants" className="flex-1 flex flex-col min-h-0">
            <TabsList className="m-3 grid grid-cols-2 flex-shrink-0">
              <TabsTrigger value="variants">Variants</TabsTrigger>
              <TabsTrigger value="format">Format</TabsTrigger>
            </TabsList>
            <TabsContent value="variants" className="flex-1 overflow-hidden m-0 min-h-0">
              <VariantPicker />
            </TabsContent>
            <TabsContent value="format" className="flex-1 overflow-y-auto m-0 min-h-0">
              {isBadge ? <BadgeFormatPanel /> : <TextFormatPanel />}
            </TabsContent>
          </Tabs>
        </aside>
      </div>

      <BrandKitDialog open={brandOpen} onOpenChange={setBrandOpen} />
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} canvas={canvasRef.current} />
    </div>
  );
};