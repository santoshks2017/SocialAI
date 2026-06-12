import { POST_TYPE_PATTERNS } from '../../data/indianAutoPatterns.js';
import type { PostType } from '../../data/indianAutoPatterns.js';

export interface PatternCard {
  id: string;
  intentType: string;
  platform?: string | undefined;
  hookTemplate: string;
  bodyPattern: string;
  ctaPattern: string;
  emojiSet: string;
  tags?: string[] | undefined;
}

export class PatternCardRepository {
  /**
   * Retrieves mock/derived pattern cards based on intentType, platform, and toneHints.
   */
  static async getTopPatternCards(params: {
    intentType?: string;
    platform?: string;
    toneHints?: string[];
  }): Promise<PatternCard[]> {
    const rawIntent = params.intentType || 'delivery';
    
    // Map request intentType to PostType keys
    let intent: PostType = 'delivery';
    if (rawIntent === 'offer') intent = 'offer';
    else if (rawIntent === 'new_arrival') intent = 'new_arrival';
    else if (rawIntent === 'festival') intent = 'festival';
    else if (rawIntent === 'testimonial') intent = 'testimonial';
    else if (rawIntent === 'engagement') intent = 'engagement';
    else if (rawIntent === 'service') intent = 'service';
    else if (rawIntent === 'ev') intent = 'ev';
    else if (rawIntent === 'finance') intent = 'finance';

    const patterns = POST_TYPE_PATTERNS[intent] || POST_TYPE_PATTERNS.delivery;

    // v0 returns up to 3 mock/derived cards based on existing pattern data.
    const cards: PatternCard[] = [];
    const count = Math.min(3, patterns.hook_templates.length);

    for (let i = 0; i < count; i++) {
      const hook = patterns.hook_templates[i] || '';
      const body = patterns.body_patterns[i % patterns.body_patterns.length] || '';
      const cta = patterns.cta_patterns[i % patterns.cta_patterns.length] || '';
      const emoji = patterns.emoji_sets[i % patterns.emoji_sets.length] || '';

      cards.push({
        id: `card_${intent}_${i + 1}`,
        intentType: intent,
        platform: params.platform,
        hookTemplate: hook,
        bodyPattern: body,
        ctaPattern: cta,
        emojiSet: emoji,
        tags: params.toneHints,
      });
    }

    return cards;
  }
}
