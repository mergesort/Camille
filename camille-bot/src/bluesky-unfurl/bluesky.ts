/**
 * Bluesky API Client
 *
 * Fetches post data from Bluesky's public API
 */

import { Logger } from '../shared/logging/logger';

const BSKY_PUBLIC_API = 'https://public.api.bsky.app/xrpc';

// Bluesky embed types
export type BlueskyEmbed =
  | BlueskyImageEmbed
  | BlueskyVideoEmbed
  | BlueskyExternalEmbed
  | BlueskyRecordEmbed
  | BlueskyRecordWithMediaEmbed;

export interface BlueskyImageEmbed {
  $type: 'app.bsky.embed.images#view';
  images: Array<{
    thumb: string;
    fullsize: string;
    alt: string;
  }>;
}

export interface BlueskyVideoEmbed {
  $type: 'app.bsky.embed.video#view';
  cid: string;
  playlist: string;
  thumbnail?: string;
  aspectRatio?: {
    width: number;
    height: number;
  };
}

export interface BlueskyExternalEmbed {
  $type: 'app.bsky.embed.external#view';
  external: {
    uri: string;
    title: string;
    description: string;
    thumb?: string;
  };
}

export interface BlueskyViewRecord {
  $type: 'app.bsky.embed.record#viewRecord';
  uri: string;
  cid: string;
  author: {
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  value: {
    text: string;
    createdAt: string;
  };
  embeds?: BlueskyEmbed[];
}

export interface BlueskyViewNotFound {
  $type: 'app.bsky.embed.record#viewNotFound';
  uri: string;
}

export interface BlueskyViewBlocked {
  $type: 'app.bsky.embed.record#viewBlocked';
  uri: string;
}

export type BlueskyRecordView =
  | BlueskyViewRecord
  | BlueskyViewNotFound
  | BlueskyViewBlocked;

export interface BlueskyRecordEmbed {
  $type: 'app.bsky.embed.record#view';
  record: BlueskyRecordView;
}

export interface BlueskyRecordWithMediaEmbed {
  $type: 'app.bsky.embed.recordWithMedia#view';
  record: BlueskyRecordEmbed;
  media: BlueskyImageEmbed | BlueskyVideoEmbed;
}

export interface BlueskyPost {
  text: string;
  author: {
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  embed?: BlueskyEmbed;
  createdAt: string;
}

type ParsedBlueskyUrl =
  | { status: 'success'; handle: string; rkey: string }
  | { status: 'invalid' };

export function parseBlueskyUrl(url: string): ParsedBlueskyUrl {
  // Matches: https://bsky.app/profile/{handle}/post/{rkey}
  const match = url.match(
    /^https?:\/\/bsky\.app\/profile\/([^/]+)\/post\/([^/?#]+)/
  );

  if (!match) {
    return { status: 'invalid' };
  }

  return {
    status: 'success',
    handle: match[1],
    rkey: match[2],
  };
}

export function isBlueskyUrl(url: string): boolean {
  return url.includes('bsky.app/profile/') && url.includes('/post/');
}

type ResolveHandleResult =
  | { status: 'success'; did: string }
  | { status: 'error'; message: string };

async function resolveHandle(handle: string): Promise<ResolveHandleResult> {
  // If it's already a DID, return it
  if (handle.startsWith('did:')) {
    return { status: 'success', did: handle };
  }

  const response = await fetch(
    `${BSKY_PUBLIC_API}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
  );

  if (!response.ok) {
    return { status: 'error', message: `Failed to resolve handle: ${handle}` };
  }

  const data = (await response.json()) as { did: string };
  return { status: 'success', did: data.did };
}

type FetchPostResult =
  | { status: 'success'; post: BlueskyPost; postUrl: string }
  | { status: 'error'; message: string };

export async function fetchBlueskyPost(
  url: string,
  logger: Logger
): Promise<FetchPostResult> {
  const parsed = parseBlueskyUrl(url);
  if (parsed.status === 'invalid') {
    return { status: 'error', message: 'Invalid Bluesky URL' };
  }

  const { handle, rkey } = parsed;

  logger.debug('Fetching Bluesky post', { handle, rkey });

  const resolveResult = await resolveHandle(handle);
  if (resolveResult.status === 'error') {
    logger.warn('Failed to resolve Bluesky handle', { handle, error: resolveResult.message });
    return resolveResult;
  }

  const { did } = resolveResult;
  const atUri = `at://${did}/app.bsky.feed.post/${rkey}`;

  const response = await fetch(
    `${BSKY_PUBLIC_API}/app.bsky.feed.getPostThread?uri=${encodeURIComponent(atUri)}&depth=0`
  );

  if (!response.ok) {
    logger.warn('Failed to fetch Bluesky post', { atUri, status: response.status });
    return { status: 'error', message: `Failed to fetch post: ${response.status}` };
  }

  const data = (await response.json()) as {
    thread: {
      $type?: string;
      post?: {
        uri: string;
        cid: string;
        author: {
          did: string;
          handle: string;
          displayName?: string;
          avatar?: string;
        };
        record: {
          text: string;
          createdAt: string;
          embed?: unknown;
        };
        embed?: BlueskyEmbed;
      };
    };
  };

  if (!data.thread.post) {
    logger.warn('Bluesky post not available', { atUri, threadType: data.thread.$type });
    return { status: 'error', message: 'Post is not available (deleted or blocked)' };
  }

  const post = data.thread.post;

  logger.debug('Successfully fetched Bluesky post', {
    handle: post.author.handle,
    hasEmbed: !!post.embed,
    embedType: post.embed?.$type
  });

  return {
    status: 'success',
    post: {
      text: post.record.text,
      author: {
        handle: post.author.handle,
        displayName: post.author.displayName,
        avatar: post.author.avatar,
      },
      embed: post.embed,
      createdAt: post.record.createdAt,
    },
    postUrl: url,
  };
}

export interface ExtractedImage {
  url: string;
  alt?: string;
}

type ExtractedMedia =
  | { type: 'none' }
  | { type: 'images'; images: ExtractedImage[] }
  | { type: 'video'; thumbnailUrl?: string; playlistUrl: string }
  | { type: 'external'; title: string; description: string; thumb?: string; uri: string };

export interface ExtractedQuote {
  text: string;
  author: {
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  media: ExtractedMedia;
}

function extractQuoteFromRecord(record: BlueskyRecordView): ExtractedQuote | undefined {
  if (record.$type !== 'app.bsky.embed.record#viewRecord') {
    return undefined;
  }

  const media = record.embeds?.length
    ? extractMedia(record.embeds[0])
    : { type: 'none' as const };

  return {
    text: record.value.text,
    author: {
      handle: record.author.handle,
      displayName: record.author.displayName,
      avatar: record.author.avatar,
    },
    media,
  };
}

export function extractQuote(embed: BlueskyEmbed | undefined): ExtractedQuote | undefined {
  if (!embed) {
    return undefined;
  }

  switch (embed.$type) {
    case 'app.bsky.embed.record#view':
      return extractQuoteFromRecord(embed.record);

    case 'app.bsky.embed.recordWithMedia#view':
      return extractQuoteFromRecord(embed.record.record);

    default:
      return undefined;
  }
}

export function extractMedia(embed: BlueskyEmbed | undefined): ExtractedMedia {
  if (!embed) {
    return { type: 'none' };
  }

  switch (embed.$type) {
    case 'app.bsky.embed.images#view':
      if (embed.images.length > 0) {
        return {
          type: 'images',
          images: embed.images.map((img) => ({
            url: img.thumb,
            alt: img.alt,
          })),
        };
      }
      return { type: 'none' };

    case 'app.bsky.embed.video#view':
      return {
        type: 'video',
        thumbnailUrl: embed.thumbnail,
        playlistUrl: embed.playlist,
      };

    case 'app.bsky.embed.external#view':
      return {
        type: 'external',
        title: embed.external.title,
        description: embed.external.description,
        thumb: embed.external.thumb,
        uri: embed.external.uri,
      };

    case 'app.bsky.embed.recordWithMedia#view':
      // Extract media from the nested media object
      return extractMedia(embed.media);

    case 'app.bsky.embed.record#view':
      // Quote posts don't have direct media
      return { type: 'none' };

    default:
      return { type: 'none' };
  }
}
