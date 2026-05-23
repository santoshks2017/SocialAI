import { supabase } from '@/integrations/supabase/client';

export async function generateSceneImage(prompt: string, _opts?: { width?: number; height?: number }): Promise<string> {
  const { data, error } = await supabase.functions.invoke('ai-generate', {
    body: { kind: 'image', prompt },
  });
  if (error) throw new Error(error.message);
  if (!data?.imageUrl) throw new Error('no image');
  return data.imageUrl as string;
}

export async function generateCopyVariants(opts: {
  brief: string;
  modelName: string;
  dealershipName: string;
}): Promise<Array<{ heading: string; byline: string }>> {
  const { data, error } = await supabase.functions.invoke('ai-generate', {
    body: { kind: 'copy', ...opts },
  });
  if (error) throw new Error(error.message);
  if (!data?.variants) throw new Error('no copy');
  return data.variants;
}