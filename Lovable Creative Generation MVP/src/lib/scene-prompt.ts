export interface ScenePromptOpts {
  brief: string;
  modelName: string;
  pose: 'front' | 'front-three-quarter' | 'side-profile' | 'hero-low-angle';
  modelClass: string;
}

const POSE_DESCRIPTIONS: Record<ScenePromptOpts['pose'], string> = {
  'front': 'photographed straight-on from the front, eye-level camera, perfectly symmetrical view',
  'front-three-quarter': 'photographed from a front three-quarter angle, ~30 degrees off the front axis, eye-level',
  'side-profile': 'photographed in pure side profile, 90 degrees, eye-level, full silhouette',
  'hero-low-angle': 'photographed from a low hero angle, camera near ground looking slightly up, three-quarter front view, dramatic',
};

function pickSceneType(modelClass: string, brief: string): string {
  const b = brief.toLowerCase();
  if (/diwali|festive|holi|navratri/.test(b)) return 'modern upscale Indian city street at dusk with warm festive ambient light from buildings, wet clean asphalt with subtle reflections, soft bokeh of warm lights in background, no people';
  if (/adventure|rugged|off-road|escape/.test(b) && /suv/.test(modelClass)) return 'wide flat dirt road at golden hour through open countryside, low rolling hills in distance, dramatic warm sky, smooth drivable terrain';
  if (/premium|luxury|elegant/.test(b)) return 'modern glass-facade building plaza at blue hour, polished granite ground, minimal architectural lines, cool premium palette';
  if (/sport|energetic|fast|dynamic/.test(b)) return 'empty highway at night with motion-blurred streetlights forming light streaks, wet black asphalt with reflections';
  if (/family|safe|trust|reliable/.test(b)) return 'quiet suburban Indian residential street at warm afternoon, tree-lined paved road, soft natural light, calm atmosphere';
  if (/test drive|book|visit|showroom/.test(b)) return 'clean modern automotive studio with seamless light-gray cyclorama, subtle floor reflection, even diffused lighting';
  const fallbacks: Record<string, string> = {
    'compact-suv': 'modern Indian metro street at golden hour, clean asphalt, glass buildings in soft bokeh',
    'suv': 'wide open coastal highway at sunset, smooth tarmac, distant hills',
    'sedan': 'business district street in early evening, polished asphalt, modern architecture in background',
    'hatchback': 'vibrant urban street with colorful market stalls in soft bokeh background',
    'luxury-sedan': 'private mansion driveway with stone-paved approach',
    'sports-car': 'mountain road switchback at golden hour with smooth tarmac',
  };
  return fallbacks[modelClass] || 'clean studio with seamless gradient backdrop';
}

export function buildScenePrompt(opts: ScenePromptOpts): string {
  return `A premium photographic scene featuring a generic ${opts.modelClass} vehicle.

CAR: GENERIC and UNBRANDED — no logos, no badges, no model names. Generic ${opts.modelClass} body shape. ${POSE_DESCRIPTIONS[opts.pose]}. Tires firmly on ground with realistic contact shadow. Lighting matches scene ambient.

SCENE: ${pickSceneType(opts.modelClass, opts.brief)}

STYLE: Premium automotive editorial photography, cinematic lighting, shallow depth of field, full-frame DSLR 35-50mm, 4K.

NEVER: real brand logos/badges/emblems, multiple cars, people, text, watermarks, floating cars.

BRIEF: ${opts.brief}`.trim();
}