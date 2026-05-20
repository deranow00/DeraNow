import Admin from '../models/Admin.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export const adminLogin = async (req, res) => {
  const { username, password } = req.body;

  try {
    const admin = await Admin.findOne({ username });
    if (!admin) return res.status(400).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: admin._id, role: admin.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.json({
      token,
      admin: {
        id: admin._id,
        username: admin.username,
        role: admin.role || 'ops_admin',
        permissions: Array.isArray(admin.permissions) ? admin.permissions : [],
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};
