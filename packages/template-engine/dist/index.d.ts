export interface Template {
    id: string;
    layout: {
        logoPosition: string;
        carImagePosition: string;
        offerBadgePosition: string;
    };
}
export declare const festivalOfferTemplate: Template;
export declare const discountOfferTemplate: Template;
export declare const minimalCleanTemplate: Template;
export declare const defaultTemplates: Record<string, Template>;
export interface RecommendTemplateInput {
    festival?: string;
}
export declare function recommendTemplate(input: RecommendTemplateInput): Template;
//# sourceMappingURL=index.d.ts.map