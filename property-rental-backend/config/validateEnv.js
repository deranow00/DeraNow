const requiredAlways = ['MONGO_URI', 'JWT_SECRET'];
const requiredInProduction = ['CORS_ORIGINS'];

const hasSmtpDeliveryConfig = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const hasBrevoApiDeliveryConfig = () =>
  Boolean(process.env.BREVO_API_KEY && (process.env.SMTP_FROM || process.env.SMTP_USER));

export const validateEnvOrExit = () => {
  const missing = requiredAlways.filter((key) => !process.env[key]);
  const productionMissing =
    process.env.NODE_ENV === 'production'
      ? requiredInProduction.filter((key) => !process.env[key])
      : [];

  const allMissing = [...missing, ...productionMissing];
  if (
    process.env.NODE_ENV === 'production' &&
    !hasSmtpDeliveryConfig() &&
    !hasBrevoApiDeliveryConfig()
  ) {
    allMissing.push('email delivery config (SMTP_HOST/SMTP_USER/SMTP_PASS or BREVO_API_KEY with SMTP_FROM)');
  }

  if (allMissing.length > 0) {
    console.error(`Missing required environment variables: ${allMissing.join(', ')}`);
    process.exit(1);
  }
};
