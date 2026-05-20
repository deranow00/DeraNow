const requestLogger = (req, res, next) => {
  const start = process.hrtime.bigint();
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    console.log(
      JSON.stringify({
        level: 'info',
        requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
        at: new Date().toISOString(),
      })
    );
  });

  next();
};

export default requestLogger;
