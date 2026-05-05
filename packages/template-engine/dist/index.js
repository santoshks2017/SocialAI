export const festivalOfferTemplate = {
    id: 'festival_offer',
    layout: {
        logoPosition: 'top-left',
        carImagePosition: 'center',
        offerBadgePosition: 'top-right'
    }
};
export const discountOfferTemplate = {
    id: 'discount_offer',
    layout: {
        logoPosition: 'top-center',
        carImagePosition: 'bottom-center',
        offerBadgePosition: 'center'
    }
};
export const minimalCleanTemplate = {
    id: 'minimal_clean',
    layout: {
        logoPosition: 'bottom-right',
        carImagePosition: 'center',
        offerBadgePosition: 'none'
    }
};
export const defaultTemplates = {
    festival_offer: festivalOfferTemplate,
    discount_offer: discountOfferTemplate,
    minimal_clean: minimalCleanTemplate
};
export function recommendTemplate(input) {
    if (input.festival && input.festival.trim().length > 0) {
        return festivalOfferTemplate;
    }
    return minimalCleanTemplate;
}
