function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

export const env = {
  NODE_ENV: optionalEnv('NODE_ENV', 'development'),
  PORT: parseInt(optionalEnv('PORT', '3000'), 10),
  DATABASE_URL: requireEnv('DATABASE_URL'),
  ADMIN_API_KEY: requireEnv('ADMIN_API_KEY'),
  ADMIN_PASSWORD: requireEnv('ADMIN_PASSWORD'),
  SESSION_SECRET: requireEnv('SESSION_SECRET'),
};
