import User from '../models/User.js';
import jwt from 'jsonwebtoken';

const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded?.id) {
      const user = await User.findById(decoded.id).select('-password');
      if (user) req.user = user;
    }
  } catch (err) {
    // ignore invalid token for optional auth
  }

  next();
};

export default optionalAuth;
