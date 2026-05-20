import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import Admin from './models/Admin.js';

dotenv.config();

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const admin = new Admin({ username: 'admin', password: hashedPassword });
    await admin.save();
    console.log('Admin user created');
    mongoose.connection.close();
  })
  .catch(err => console.log(err));
