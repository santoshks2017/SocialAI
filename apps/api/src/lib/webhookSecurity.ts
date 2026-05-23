import crypto from 'crypto';

/**
 * Validate Meta Hub signature.
 * Meta sends X-Hub-Signature-256 header in format: sha256=<signature>
 */
export function validateMetaSignature(rawBody: string | Buffer, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;
  
  // Format is "sha256=<signature>"
  const parts = signature.split('=');
  const signatureHash = parts[1] || parts[0];
  if (!signatureHash) return false;
  
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(rawBody).digest('hex');
  
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHash, 'hex'),
      Buffer.from(digest, 'hex')
    );
  } catch (err) {
    return false;
  }
}

/**
 * Validate Razorpay webhook signature.
 * Razorpay sends x-razorpay-signature header.
 */
export function validateRazorpaySignature(rawBody: string | Buffer, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;
  
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(rawBody).digest('hex');
  
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(digest, 'hex')
    );
  } catch (err) {
    return false;
  }
}
