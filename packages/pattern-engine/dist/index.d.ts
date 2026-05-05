export interface PatternDataInput {
    images: string[];
    text: string;
}
export interface PatternDataOutput {
    imageCount: number;
    hasPhone: boolean;
    detectedFestivals: string[];
}
export declare function extractPatterns(data: PatternDataInput): PatternDataOutput;
//# sourceMappingURL=index.d.ts.map