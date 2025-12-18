import { Gauge, Histogram, Counter, register } from 'prom-client';

export const queueLengthGauge = new Gauge({
  name: 'queue_length',
  help: 'Current number of sessions in queue',
  labelNames: ['queue_type'],
  registers: [register],
});

export const queueWaitTimeHistogram = new Histogram({
  name: 'queue_wait_time_seconds',
  help: 'Time spent waiting in queue before agent assignment',
  labelNames: ['queue_type'],
  buckets: [5, 10, 30, 60, 120, 300, 600, 1800],
  registers: [register],
});

export const redisConnectionErrorsCounter = new Counter({
  name: 'redis_connection_errors_total',
  help: 'Total number of Redis connection errors',
  labelNames: ['error_type'],
  registers: [register],
});

export const wsConnectionsGauge = new Gauge({
  name: 'ws_connections_active',
  help: 'Current number of active WebSocket connections',
  labelNames: ['client_type'],
  registers: [register],
});

export const wsMessagesCounter = new Counter({
  name: 'ws_messages_total',
  help: 'Total number of WebSocket messages',
  labelNames: ['direction'],
  registers: [register],
});

export const httpRequestsCounter = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestDurationHistogram = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register],
});
