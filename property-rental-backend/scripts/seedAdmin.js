import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';

dotenv.config();

const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL || 'admin@propertyrental.com').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';
const ADMIN_NAME = (process.env.SEED_ADMIN_NAME || 'System Admin').trim();
const ADMIN_CITIZENSHIP = (process.env.SEED_ADMIN_CITIZENSHIP || 'ADMIN-0001').trim();

async function seedAdmin() {
  await connectDB();

  try {
    const existing = await User.findOne({ email: ADMIN_EMAIL });
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

    if (existing) {
      existing.role = 'admin';
      existing.password = passwordHash;
      existing.name = existing.name || ADMIN_NAME;
      existing.citizenshipNumber = existing.citizenshipNumber || ADMIN_CITIZENSHIP;
      existing.emailVerified = true;
      existing.emailVerifiedAt = new Date();
      await existing.save();

      console.log(`Updated existing user as admin: ${ADMIN_EMAIL}`);
    } else {
      await User.create({
        name: ADMIN_NAME,
        citizenshipNumber: ADMIN_CITIZENSHIP,
        email: ADMIN_EMAIL,
        password: passwordHash,
        role: 'admin',
        emailVerified: true,
        emailVerifiedAt: new Date(),
      });

      console.log(`Created admin user: ${ADMIN_EMAIL}`);
    }

    console.log('Admin seed completed.');
  } catch (err) {
    console.error('Admin seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

seedAdmin();
