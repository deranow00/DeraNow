import http from 'http';
import dotenv from 'dotenv';
import app from './app.js';
import { setupSocket } from './socket.js';
import './cronJobs/paymentReminder.js';
import { validateEnvOrExit } from './config/validateEnv.js';

dotenv.config();
validateEnvOrExit();

const PORT = process.env.PORT || 8000;
const server = http.createServer(app);
setupSocket(server);

server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
});
