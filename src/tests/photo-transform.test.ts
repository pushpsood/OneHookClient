import { describe, expect, it } from 'vitest';
import { CENTERED_TRANSFORM, parsePictureTransform, pictureTransformStyle } from '../utils/photo-transform';

describe('picture preview transforms', () => {
  it('defaults legacy profiles to a centered unzoomed preview', () => {
    expect(parsePictureTransform(undefined)).toEqual(CENTERED_TRANSFORM);
  });
  it('round-trips the versioned wire value and clamps hostile values', () => {
    expect(parsePictureTransform('v1:0.2,0.8,2.25')).toEqual({ focalX: 0.2, focalY: 0.8, zoom: 2.25 });
    expect(parsePictureTransform('v1:-2,5,20')).toEqual({ focalX: 0, focalY: 1, zoom: 4 });
  });
  it('applies focal point and zoom as display CSS without changing the src', () => {
    expect(pictureTransformStyle('v1:0.25,0.75,2')).toEqual({
      objectPosition: '25% 75%', transformOrigin: '25% 75%', transform: 'scale(2)',
    });
  });
  it('rejects malformed metadata safely', () => {
    expect(parsePictureTransform('bad')).toEqual(CENTERED_TRANSFORM);
  });
});
