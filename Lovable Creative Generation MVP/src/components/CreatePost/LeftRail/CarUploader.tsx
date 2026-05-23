// src/components/CreatePost/LeftRail/CarUploader.tsx
// 4-pose grid for car PNG library.

import { useRef, useState } from 'react';
import { X, Camera } from 'lucide-react';
import { toast } from 'sonner';
import { usePostStore, type CarPngVariant } from '@/store/postStore';

const POSES: Array<{
  id: CarPngVariant['pose'];
  label: string;
  hint: string;
  required: boolean;
}> = [
  { id: 'front-three-quarter', label: 'Front 3/4', hint: 'Slant view, OEM standard', required: true },
  { id: 'front',               label: 'Front',     hint: 'Straight-on',              required: false },
  { id: 'side-profile',        label: 'Side',      hint: '90° profile',              required: false },
  { id: 'hero-low-angle',      label: 'Hero',      hint: 'Low dramatic angle',       required: false },
];

export const CarUploader = () => {
  const carLibrary = usePostStore((s) => s.carLibrary);
  const setCarVariant = usePostStore((s) => s.setCarVariant);
  const removeCarVariant = usePostStore((s) => s.removeCarVariant);

  return (
    <div className="space-y-3 pt-2">
      <p className="text-xs text-neutral-500 leading-relaxed">
        Upload one PNG per camera angle. The AI matches scenes to the angles you provide.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {POSES.map((pose) => {
          const variant = carLibrary.find((c) => c.pose === pose.id);
          return (
            <PoseSlot
              key={pose.id}
              pose={pose}
              variant={variant}
              onUpload={(file) => handleUpload(file, pose.id, setCarVariant)}
              onRemove={() => removeCarVariant(pose.id)}
            />
          );
        })}
      </div>
    </div>
  );
};

async function handleUpload(
  file: File,
  pose: CarPngVariant['pose'],
  setCarVariant: (variant: CarPngVariant) => void
) {
  if (!file.type.includes('png')) {
    toast.error('Please upload a PNG file');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    toast.error('File must be under 10MB');
    return;
  }

  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await new Promise((r) => (img.onload = r));

  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height).data;

  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 200) transparent++;
  const transparentPct = transparent / (data.length / 4);
  if (transparentPct < 0.05) {
    toast.warning('PNG appears to lack transparent background. Output may suffer.');
  }

  setCarVariant({
    pose,
    previewUrl: url,
    fileName: file.name,
    width: img.width,
    height: img.height,
  });
}

interface PoseSlotProps {
  pose: typeof POSES[number];
  variant: CarPngVariant | undefined;
  onUpload: (file: File) => void;
  onRemove: () => void;
}

function PoseSlot({ pose, variant, onUpload, onRemove }: PoseSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  if (variant) {
    return (
      <div className="relative rounded-lg border border-neutral-200 p-2 bg-neutral-50 group">
        <img
          src={variant.previewUrl}
          alt={pose.label}
          className="w-full h-20 object-contain"
        />
        <p className="text-xs font-medium text-neutral-700 mt-1">{pose.label}</p>
        <button
          onClick={onRemove}
          className="absolute top-1 right-1 p-1 rounded-full bg-white border border-neutral-200 opacity-0 group-hover:opacity-100 transition"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border-2 border-dashed p-3 text-center cursor-pointer transition ${
        dragOver ? 'border-orange-500 bg-orange-50' : 'border-neutral-300 hover:border-neutral-400'
      }`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) onUpload(file);
      }}
    >
      <Camera className="w-4 h-4 mx-auto text-neutral-400 mb-1" />
      <p className="text-xs font-medium text-neutral-700">{pose.label}</p>
      <p className="text-[10px] text-neutral-500 mt-0.5">{pose.hint}</p>
      {pose.required && (
        <span className="inline-block mt-1 px-1.5 py-0.5 text-[9px] rounded bg-orange-100 text-orange-700">
          required
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
      />
    </div>
  );
}
