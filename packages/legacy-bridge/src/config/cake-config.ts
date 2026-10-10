/**
 * 1:1 CakePHP Config & Bootstrap Emulation (core.php, bootstrap.php, routes.php, database.php, acl.ini.php)
 * Centralizes configuration, database connections, caching levels, and ACL trees.
 */

export interface DatabaseConfig {
  host: string;
  port: number;
  login: string;
  password: string;
  database: string;
  prefix: string;
  encoding: string;
}

export interface SecurityConfig {
  salt: string;
  cipherSeed: string;
  jwtSecret: string;
  jwtExpirySeconds: number;
}

export class CakeConfig {
  public static database: DatabaseConfig = {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    login: process.env.DB_USER || 'xbet_user',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'xbet_modern',
    prefix: '',
    encoding: 'utf8',
  };

  public static security: SecurityConfig = {
    salt: process.env.SECURITY_SALT || 'DYhG93b0qyJfIxfs2guVoUubWwvniR2G0FgaC9mi',
    cipherSeed: process.env.CIPHER_SEED || '76859309657453542496749683645',
    jwtSecret: process.env.JWT_SECRET || '',
    jwtExpirySeconds: 86400,
  };

  public static app = {
    name: 'xBET Modern Sportsbook & Gaming',
    defaultLanguage: 'en',
    defaultCurrency: 'USD',
    defaultTimeZone: '0.0', // GMT
    minStake: 0.10,
    maxStake: 10000.0,
    maxCombiLegs: 20,
    cashoutMargin: 0.95, // 5% house retention on early cashout
  };

  public static email = {
    transport: 'Smtp',
    from: 'support@xbet.local',
    host: process.env.SMTP_HOST || 'mailhog',
    port: parseInt(process.env.SMTP_PORT || '1025', 10),
    timeout: 30,
  };
}
