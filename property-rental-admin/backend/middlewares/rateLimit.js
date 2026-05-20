const store = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of store.entries()) {
    if (value.resetAt <= now) store.delete(key);
  }
}, 10 * 60 * 1000).unref();

export const createRateLimiter = ({ windowMs = 60_000, max = 120, keyPrefix = 'admin' } = {}) => {
  return (req, res, next) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    const current = store.get(key);
    if (!current || current.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    current.count += 1;
    if (current.count > max) {
      const retryAfter = Math.ceil((current.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(Math.max(1, retryAfter)));
      return res.status(429).json({ error: 'Too many requests' });
    }
    return next();
  };
};
