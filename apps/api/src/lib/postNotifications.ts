import type { Post } from '../generated/client/index.js';
import { postLabel } from './approvals.js';
import { notify } from './notifications.js';
import { PERMISSIONS } from './permissions.js';
import { usersWithPermission } from './teamMembers.js';

export interface PublishOutcomeNotice {
  post: Pick<Post, 'id' | 'dealer_id' | 'prompt_text' | 'created_by'>;
  status: 'published' | 'failed';
  /** Display names of the platforms that have the post, e.g. "Facebook". */
  publishedOn: string[];
  /** Display names of the platforms that failed. */
  failedOn: string[];
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// Tells the author (or, for posts without one, everyone who can publish) how publishing went.
// Never throws: a notification problem must not turn a finished publish into an error.
export async function notifyPublishOutcome(notice: PublishOutcomeNotice): Promise<void> {
  try {
    const { post } = notice;
    const userIds = post.created_by
      ? [post.created_by]
      : await usersWithPermission(post.dealer_id, PERMISSIONS.PUBLISH_POST);
    const label = postLabel(post);

    if (notice.status === 'failed') {
      const where = notice.failedOn.length ? ` to ${joinNames(notice.failedOn)}` : '';
      await notify({
        dealerId: post.dealer_id, type: 'post_failed', userIds,
        title: 'Post failed to publish',
        body: `"${label}" could not be published${where}. Open Posts to retry.`,
        link: '/posts?status=failed',
      });
      return;
    }

    const partial = notice.failedOn.length > 0;
    await notify({
      dealerId: post.dealer_id, type: 'post_published', userIds,
      title: partial ? 'Post partly published' : 'Post published',
      body: partial
        ? `"${label}" is live on ${joinNames(notice.publishedOn)} but failed on ${joinNames(notice.failedOn)}.`
        : `"${label}" is live on ${joinNames(notice.publishedOn)}.`,
      link: '/posts?status=published',
    });
  } catch (err) {
    console.error('[notifications] Could not record the publish outcome', err);
  }
}
