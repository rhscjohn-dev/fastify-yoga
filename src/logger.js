const { createLogger, format, transports } = require('winston');
require('winston-daily-rotate-file');
const path = require('path');


const pathLogs = path.join(process.cwd(), process.env.PATH_LOGS);

const logger = createLogger({
  level: process.env.LOGGER_CONSOLE,
  format: format.combine(
    format.label([{ label: '' }]),
    format.errors({ stack: false }),
    format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss:SS'
    }),
    format.splat(),
    format.printf(
      info =>
        `${info.timestamp} ${info.level} [${info.label}]  ${info.message}`
    )
  ),
  transports: [
    new transports.Console({
      level: process.env.LOGGER_CONSOLE,
      format: format.combine(
        format.colorize(),
        format.splat(),
        format.printf(
          info => `${info.level} [${info.label}]: ${info.message}`
        )
      )
    }),
    new transports.DailyRotateFile({
      filename: `${pathLogs}/graphql-server-${process.env.NODE_ENV}-%DATE%.log`,
      dirname: `${pathLogs}`,
      level: process.env.LOGGER_FILE,
      datePattern: 'YYYY-MM-DD',
      zippedArchive: false,
      maxFiles: '2d'
    })
  ]
});

module.exports = logger;
