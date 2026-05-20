export const calcOccupancyRate = (occupiedProperties, approvedProperties) => {
  const occupied = Number(occupiedProperties || 0);
  const approved = Number(approvedProperties || 0);
  if (!approved) return 0;
  return Number(((occupied / approved) * 100).toFixed(2));
};

export const calcProfit = (revenue, ownerDistributed) => {
  const left = Number(revenue || 0);
  const right = Number(ownerDistributed || 0);
  return Number((left - right).toFixed(2));
};

export const calcMoMChangePct = (current, previous) => {
  const curr = Number(current || 0);
  const prev = Number(previous || 0);
  if (!prev) return 0;
  return Number((((curr - prev) / prev) * 100).toFixed(2));
};
