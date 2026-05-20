const requiredAlways = ['MONGO_URI', 'JWT_SECRET'];
const requiredInProduction = ['CORS_ORIGINS'];

export const validateEnvOrExit = () => {
  const missing = requiredAlways.filter((key) => !process.env[key]);
  const productionMissing =
    process.env.NODE_ENV === 'production'
      ? requiredInProduction.filter((key) => !process.env[key])
      : [];

  const allMissing = [...missing, ...productionMissing];
  if (allMissing.length > 0) {
    console.error(`Missing required environment variables: ${allMissing.join(', ')}`);
    process.exit(1);
  }
};
