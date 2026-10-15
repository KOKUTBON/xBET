export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  host: process.env.HOST || '0.0.0.0',
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  nodeEnv: process.env.NODE_ENV || 'development',
  defaultBookmakerMargin: parseFloat(process.env.BOOKMAKER_MARGIN || '1.06'), // 6% margin
  oddsTickIntervalMs: parseInt(process.env.ODDS_TICK_INTERVAL_MS || '2000', 10),
  matchClockIntervalMs: parseInt(process.env.MATCH_CLOCK_INTERVAL_MS || '1000', 10),
};
