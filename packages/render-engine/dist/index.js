import { createCanvas, loadImage } from '@napi-rs/canvas';
export async function renderCreative(input) {
    const width = 1080;
    const height = 1080;
    // Create a 1080x1080 canvas
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    // Draw white background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    // Load and draw the car image
    try {
        const image = await loadImage(input.imageUrl);
        // Calculate aspect ratio to scale the image properly to fit within the canvas
        const maxImageWidth = 900;
        const maxImageHeight = 600;
        let imgWidth = image.width;
        let imgHeight = image.height;
        const ratio = Math.min(maxImageWidth / imgWidth, maxImageHeight / imgHeight);
        imgWidth = imgWidth * ratio;
        imgHeight = imgHeight * ratio;
        // Center the image vertically and horizontally
        const imgX = (width - imgWidth) / 2;
        const imgY = (height - imgHeight) / 2;
        // Use proper anti-aliasing for the image
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(image, imgX, imgY, imgWidth, imgHeight);
    }
    catch (error) {
        console.warn(`Could not load image from ${input.imageUrl}:`, error);
        // Continue rendering even if image fails, so text still appears
    }
    // Draw Title at top
    // Enable anti-aliasing for text
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 72px sans-serif'; // Large font size to prevent blurriness
    // Add some padding from the top
    ctx.fillText(input.title, width / 2, 100);
    // Draw Offer in bold red text at the bottom
    ctx.fillStyle = '#FF0000';
    ctx.font = 'bold 96px sans-serif';
    // Add some padding from the bottom
    ctx.textBaseline = 'bottom';
    ctx.fillText(input.offer, width / 2, height - 100);
    // Return the image as a PNG buffer
    return canvas.toBuffer('image/png');
}
