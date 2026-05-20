import User from '../models/User.js';
import jwt from 'jsonwebtoken';

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authorized, token missing' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || !decoded.id) {
      return res.status(401).json({ error: 'Not authorized, token invalid' });
    }

    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (user.isActive === false) {
      return res.status(403).json({ error: 'Account is disabled. Contact support.' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.log('JWT verification failed:', err.message);
    return res.status(401).json({ error: 'Not authorized, token invalid' });
  }
};

export default protect;
