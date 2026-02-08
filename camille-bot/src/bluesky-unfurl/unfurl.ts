/**
 * Bluesky Unfurl Formatter
 *
 * Converts Bluesky posts to Slack legacy unfurl attachments.
 * Always uses legacy attachment fields (color, title_link, text, image_url)
 * to preserve the blue color bar. Only the first image is shown for multi-image posts.
 */

import { BlueskyPost, extractMedia, extractQuote, ExtractedQuote } from './bluesky';

const BLUESKY_BLUE = '#0085ff';

export interface SlackUnfurlAttachment {
  title?: string;
  title_link?: string;
  text?: string;
  image_url?: string;
  thumb_url?: string;
  color?: string;
  footer?: string;
  footer_icon?: string;
  ts?: number;
}

function formatQuoteText(quote: ExtractedQuote): string {
  const authorName = quote.author.displayName || quote.author.handle;

  let result = `*Quoting ${authorName}* (@${quote.author.handle})`;

  if (quote.text) {
    const blockquoted = quote.text
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    result += `\n${blockquoted}`;
  }

  return result;
}

export function formatUnfurl(post: BlueskyPost, postUrl: string): SlackUnfurlAttachment {
  const media = extractMedia(post.embed);
  const quote = extractQuote(post.embed);

  // Build the main text, appending quote if present
  let text = post.text;

  if (quote) {
    const quoteSection = formatQuoteText(quote);
    text = text ? `${text}\n\n${quoteSection}` : quoteSection;
  }

  return formatAttachment(post, postUrl, media, quote, text);
}

function formatAttachment(
  post: BlueskyPost,
  postUrl: string,
  media: ReturnType<typeof extractMedia>,
  quote: ExtractedQuote | undefined,
  text: string | undefined
): SlackUnfurlAttachment {
  const authorName = post.author.displayName || post.author.handle;
  const title = post.author.displayName
    ? `${authorName} (@${post.author.handle})`
    : `@${post.author.handle}`;

  const attachment: SlackUnfurlAttachment = {
    color: BLUESKY_BLUE,
    title,
    title_link: postUrl,
  };

  // Track whether we've already embedded a link to the post in the text
  let hasInlineLink = false;

  switch (media.type) {
    case 'images':
      attachment.image_url = media.images[0].url;
      if (media.images.length > 1) {
        text = (text || '') + (text ? '\n\n' : '') + `:camera: <${postUrl}|This post contains ${media.images.length} images>`;
        hasInlineLink = true;
      }
      break;

    case 'video':
      text = (text || '') + (text ? '\n\n' : '') + `:movie_camera: <${postUrl}|This post contains a video>`;
      hasInlineLink = true;
      if (media.thumbnailUrl) {
        attachment.image_url = media.thumbnailUrl;
      }
      break;

    case 'external': {
      const linkLine = `:link: <${media.uri}|${media.title}>`;
      text = text ? `${text}\n\n${linkLine}` : linkLine;
      if (media.thumb) {
        attachment.image_url = media.thumb;
      }
      break;
    }

    case 'none':
      // If no main media, fall through to quoted post media
      if (quote?.media.type === 'images') {
        attachment.image_url = quote.media.images[0].url;
      } else if (quote?.media.type === 'video') {
        text = (text || '') + (text ? '\n\n' : '') + `:movie_camera: <${postUrl}|Quoted post contains a video>`;
        hasInlineLink = true;
        if (quote.media.thumbnailUrl) {
          attachment.image_url = quote.media.thumbnailUrl;
        }
      }
      break;
  }

  if (hasInlineLink) {
    attachment.text = text;
  } else {
    const linkSuffix = `<${postUrl}|View on Bluesky>`;
    attachment.text = text ? `${text}\n\n${linkSuffix}` : linkSuffix;
  }

  return attachment;
}
