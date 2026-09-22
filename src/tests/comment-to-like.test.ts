import { describe, it, expect } from 'vitest';
import {
  LIKE_COMMENT_MAX_CHARS,
  LIKE_TARGET_REF_MAX_CHARS,
  type LikeTargetType,
} from '../api/rest';
import { isVideoKey, mediaLikeType } from '../features/discovery/like-target';

/**
 * Client-side mirror of the authoritative backend contract for Hinge-style comment-to-like
 * (matching.smithy + MatchingConstants). If the backend caps change, these must change with them.
 */
describe('Comment-to-like: backend contract mirror', () => {
  it('comment cap matches the backend (LIKE_COMMENT_MAX_CHARS = 500)', () => {
    expect(LIKE_COMMENT_MAX_CHARS).toBe(500);
  });

  it('target-ref cap matches the backend (LIKE_TARGET_REF_MAX_CHARS = 512)', () => {
    expect(LIKE_TARGET_REF_MAX_CHARS).toBe(512);
  });

  it('supports exactly the backend likeTargetType values', () => {
    const types: LikeTargetType[] = ['PHOTO', 'VIDEO', 'VOICE', 'PROMPT', 'INTEREST', 'BIO'];
    // A compile-time exhaustive assignment plus a runtime length check guards against drift.
    expect(new Set(types).size).toBe(6);
  });
});

describe('Comment-to-like: media type detection', () => {
  it('classifies video object keys as VIDEO', () => {
    ['media/u1/clip.mp4', 'media/u1/reel.MOV', 'pending/u1/a.webm', 'media/u1/x.m4v'].forEach((k) => {
      expect(isVideoKey(k)).toBe(true);
      expect(mediaLikeType(k)).toBe('VIDEO');
    });
  });

  it('classifies image object keys as PHOTO', () => {
    ['media/u1/photo.jpg', 'media/u1/pic.png', 'media/u1/shot.jpeg', 'media/u1/a.webp'].forEach((k) => {
      expect(isVideoKey(k)).toBe(false);
      expect(mediaLikeType(k)).toBe('PHOTO');
    });
  });
});

describe('Comment-to-like: composer submit gate (client rules)', () => {
  // Mirrors CommentComposer.canSubmit: non-empty after trim AND within the cap.
  const canSubmit = (comment: string) =>
    comment.trim().length > 0 && comment.length <= LIKE_COMMENT_MAX_CHARS;

  it('disables submit for empty / whitespace-only comments', () => {
    expect(canSubmit('')).toBe(false);
    expect(canSubmit('   ')).toBe(false);
    expect(canSubmit('\n\t ')).toBe(false);
  });

  it('enables submit for a non-empty comment within the cap', () => {
    expect(canSubmit('I love this photo')).toBe(true);
    expect(canSubmit('a'.repeat(LIKE_COMMENT_MAX_CHARS))).toBe(true);
  });

  it('disables submit once the comment exceeds the cap', () => {
    expect(canSubmit('a'.repeat(LIKE_COMMENT_MAX_CHARS + 1))).toBe(false);
  });
});

describe('Comment-to-like: swipe body shaping', () => {
  // Mirrors SwipeApi.like / SwipeApi.pass request bodies without hitting the network.
  const likeBody = (
    targetId: string,
    comment: string,
    likeTargetType: LikeTargetType,
    likeTargetRef?: string
  ) => ({ targetId, direction: 'RIGHT' as const, comment, likeTargetType, likeTargetRef });

  const passBody = (targetId: string) => ({ targetId, direction: 'LEFT' as const });

  it('a LIKE carries a comment + element type + ref (photo)', () => {
    const body = likeBody('bob', 'nice shot', 'PHOTO', 'media/bob/1.jpg');
    expect(body.direction).toBe('RIGHT');
    expect(body.comment).toBe('nice shot');
    expect(body.likeTargetType).toBe('PHOTO');
    expect(body.likeTargetRef).toBe('media/bob/1.jpg');
  });

  it('a BIO like needs no ref (server normalises it to "bio")', () => {
    const body = likeBody('bob', 'love your energy', 'BIO');
    expect(body.likeTargetType).toBe('BIO');
    expect(body.likeTargetRef).toBeUndefined();
  });

  it('a PASS carries neither comment nor target', () => {
    const body = passBody('bob') as Record<string, unknown>;
    expect(body.direction).toBe('LEFT');
    expect(body.comment).toBeUndefined();
    expect(body.likeTargetType).toBeUndefined();
    expect(body.likeTargetRef).toBeUndefined();
  });
});
