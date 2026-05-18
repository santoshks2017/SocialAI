import { useState } from 'react';
import * as fabric from 'fabric';
import { VariantPanel } from './VariantPanel';
import { TextPanel } from './TextPanel';
import { BadgePanel } from './BadgePanel';

type Tab = 'Variants' | 'Text' | 'Badge';
const TABS: Tab[] = ['Variants', 'Text', 'Badge'];

interface Props { canvas: fabric.Canvas | null; initialHeading?: string; }

export function RightRail({ canvas, initialHeading }: Props) {
  const [tab, setTab] = useState<Tab>('Variants');
  return (
    <aside className="w-60 shrink-0 border-l border-neutral-200 bg-white flex flex-col overflow-hidden">
      <div className="flex border-b border-neutral-200 shrink-0">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-xs font-bold transition-colors ${tab===t ? 'text-orange-600 border-b-2 border-orange-500' : 'text-neutral-500 hover:text-neutral-700'}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'Variants' && <VariantPanel />}
        {tab === 'Text'     && <TextPanel canvas={canvas} initialHeading={initialHeading} />}
        {tab === 'Badge'    && <BadgePanel canvas={canvas} />}
      </div>
    </aside>
  );
}
