export interface CarModelView {
  id: string;
  brand: string;
  model_name: string;
  color: string | null;
  image_url: string;
}

interface ModelLike {
  id: string;
  brand: string;
  model_name: string;
  alias_names: string[];
  colours: unknown;
  images: unknown;
}

type ImageLike = string | { angle?: string; url?: string };

const urlOf = (img: ImageLike | undefined): string => (typeof img === 'string' ? img : img?.url ?? '');
const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

export function carModelView(model: ModelLike): CarModelView {
  const images = asArray<ImageLike>(model.images);
  const colours = asArray<{ name?: string; images?: ImageLike[] }>(model.colours);
  const front = images.find((img) => typeof img !== 'string' && img.angle === 'front_exterior');
  const colourFront = asArray<ImageLike>(colours[0]?.images).find((img) => typeof img !== 'string' && img.angle === 'front_exterior');
  const image = urlOf(front) || urlOf(colourFront) || urlOf(images[0]) || urlOf(asArray<ImageLike>(colours[0]?.images)[0]);
  return { id: model.id, brand: model.brand, model_name: model.model_name, color: colours[0]?.name ?? null, image_url: image };
}

/** Models whose alias appears in `text`, best (longest alias) first. */
export function matchCarModels(models: ModelLike[], text: string, limit = 5): CarModelView[] {
  const lower = text.toLowerCase();
  return models
    .map((model) => ({ model, score: Math.max(0, ...model.alias_names.filter((a) => a && lower.includes(a.toLowerCase())).map((a) => a.length)) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((m) => carModelView(m.model));
}
