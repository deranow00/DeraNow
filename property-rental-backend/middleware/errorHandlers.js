export const notFoundHandler = (req, res) => {
  return res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    requestId: req.requestId,
  });
};

export const errorHandler = (err, req, res, _next) => {
  console.error('Unhandled API error:', {
    requestId: req.requestId,
    path: req.originalUrl,
    method: req.method,
    message: err?.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err?.stack,
  });

  if (res.headersSent) return;
  res.status(err?.statusCode || 500).json({
    error: err?.publicMessage || 'Internal server error',
    requestId: req.requestId,
  });
};
