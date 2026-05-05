const FESTIVAL_KEYWORDS = ['diwali', 'navratri', 'akshaya', 'dussehra', 'holi'];
export function extractPatterns(data) {
    const text = data.text || '';
    const textLower = text.toLowerCase();
    // Detect phone numbers (10 consecutive digits, optionally separated by spaces or dashes)
    // e.g., 9876543210, 987-654-3210, 987 654 3210
    const phoneRegex = /(?:\+91|0)?\s*[6-9]\d{2}\s*[-]?\s*\d{3}\s*[-]?\s*\d{4}\b/;
    const hasPhone = phoneRegex.test(text);
    // Detect festivals
    const detectedFestivals = FESTIVAL_KEYWORDS.filter(keyword => textLower.includes(keyword));
    return {
        imageCount: data.images?.length || 0,
        hasPhone,
        detectedFestivals
    };
}
