import test from 'node:test';
import assert from 'node:assert/strict';
import { calcMoMChangePct, calcOccupancyRate, calcProfit } from '../utils/kpiMath.js';

test('calcOccupancyRate handles zero denominator', () => {
  assert.equal(calcOccupancyRate(2, 0), 0);
});

test('calcOccupancyRate rounds to 2 decimals', () => {
  assert.equal(calcOccupancyRate(5, 12), 41.67);
});

test('calcProfit subtracts values', () => {
  assert.equal(calcProfit(10000, 6400), 3600);
});

test('calcMoMChangePct returns 0 when previous is 0', () => {
  assert.equal(calcMoMChangePct(500, 0), 0);
});

test('calcMoMChangePct computes growth', () => {
  assert.equal(calcMoMChangePct(1500, 1000), 50);
});
