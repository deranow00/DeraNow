import test from 'node:test';
import assert from 'node:assert/strict';
import { calcMoMChangePct, calcOccupancyRate, calcProfit } from '../utils/kpiMath.js';

test('calcOccupancyRate handles zero denominator', () => {
  assert.equal(calcOccupancyRate(5, 0), 0);
});

test('calcOccupancyRate returns rounded percentage', () => {
  assert.equal(calcOccupancyRate(3, 7), 42.86);
});

test('calcProfit subtracts owner distribution from revenue', () => {
  assert.equal(calcProfit(1200, 800), 400);
});

test('calcMoMChangePct handles missing previous month', () => {
  assert.equal(calcMoMChangePct(1000, 0), 0);
});

test('calcMoMChangePct returns percentage delta', () => {
  assert.equal(calcMoMChangePct(900, 1200), -25);
});
