import { describe, expect, it } from 'vitest';
import { unframe } from './snap';

describe('pins on a squared photo', () => {
  // a landscape photo, 768 by 576, centred in the square with bars above and below
  const frame = { x: 0, y: 96 / 768, w: 1, h: 576 / 768 };

  it('moves a pin from the square onto the photo as it is shown', () => {
    expect(unframe([0.5, 0.5], frame)).toEqual([0.5, 0.5]);
    expect(unframe([0.25, 96 / 768], frame)).toEqual([0.25, 0]);
  });

  it('keeps a pin placed on a bar at the edge of the photo', () => {
    expect(unframe([0.25, 0.02], frame)).toEqual([0.25, 0]);
    expect(unframe([0.25, 0.98], frame)).toEqual([0.25, 1]);
  });
});
