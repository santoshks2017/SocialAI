// Approval links are public URLs shaped like /v1/publisher/approval/<token>: the raw token is a
// bearer credential for approving or rejecting a post, so it must never land in request logs.
export function redactApprovalToken(url: string): string {
  return url.replace(/(\/approval\/)[^/?#]+/, '$1[redacted]');
}
