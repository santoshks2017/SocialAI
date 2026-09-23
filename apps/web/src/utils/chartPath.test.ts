import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { labelStride, smoothPath, yTicks } from './chartPath.js';

describe('smoothPath', () => {
  it('draws a Catmull-Rom curve through the points', () => {
    assert.equal(smoothPath([]), '');
    assert.equal(smoothPath([[1, 2]]), 'M1.0,2.0');
    assert.equal(smoothPath([[0, 0], [6, 6]]), 'M0.0,0.0 C1.0,1.0 5.0,5.0 6.0,6.0');
  });
});

describe('yTicks', () => {
  it('uses small steps for small counts and about four lines otherwise', () => {
    assert.deepEqual(yTicks(1), [1]);
    assert.deepEqual(yTicks(3), [1, 2, 3]);
    assert.deepEqual(yTicks(7), [2, 4, 6]);
    assert.deepEqual(yTicks(12), [5, 10]);
    assert.deepEqual(yTicks(40), [10, 20, 30, 40]);
  });
});

describe('labelStride', () => {
  it('keeps x-axis labels about 60px apart', () => {
    assert.equal(labelStride(14, 640), 2);
    assert.equal(labelStride(30, 280), 8);
    assert.equal(labelStride(7, 900), 1);
  });
});
