//  get the correct dotenv loaded
let dotenv
if (process.env.NODE_ENV === 'production') {
  dotenv = require('dotenv').config({ path: `${process.cwd()}/prod.env` })
} else {
  process.env.NODE_ENV = 'development'
  dotenv = require('dotenv').config({ path: `${process.cwd()}/dev.env` })
}

const os = require('os');
const ip = require('ip')
// const util = require('./utils');
const path = require('path');
const fs = require('fs')
// const NodeCache = require("node-cache");

const logger = require("./logger")
const label = path.basename(__filename);

// document the environment
logger.transports.forEach(transport => {
  logger.info(`Logger: Name - ${transport.name}, Level - ${transport.level}, dirname - ${transport.dirname}, filename -${transport.filename}`, { label })
})
logger.info(`NODE_ENV: ${process.env.NODE_ENV}`, { label })
if (process.env.NODE_ENV === 'production') {
  console.info(`NODE_ENV: ${process.env.NODE_ENV}`, { label })
}
logger.verbose('dotenv: %o', dotenv.parsed, { label })
logger.debug(`__dirname contains: ${__dirname}`, { label });
logger.info(`OS type: ${os.type}`, { label })
logger.info(`OS hostname: ${os.hostname}`, { label })
logger.info(`IP: ${ip.address()}`, { label });

// verify existence of ffmpeg folder
fs.stat(process.env.FFMPEG_PATH, (err) => {
  if (!err) {
    logger.info('ffmpeg path exists.', { label });
  }
  else {
    logger.error(`ffmpeg path: ${process.env.FFMPEG_PATH} does not exist! Error:`, err, { label });
  }
})
// verify existence of QSVEnc folder
fs.stat(process.env.QSVENC_PATH, (err) => {
  if (!err) {
    logger.info('QSVEnc path exists.', { label });
  }
  else {
    logger.error(`QSVEnc path: ${process.env.QSVENC_PATH} does not exist! Error:`, err, { label });
  }
})
// set up the fastify server
// const autoload = require('@fastify/autoload')
const app = require('fastify')({ logger: false })
// Declare a route
app.get('/', async (request, reply) => {
  return { hello: 'world' }
})

// Run the server!
const start = async () => {
  let host = "localhost"
  if (process.env.NODE_ENV === 'production') {
    host = ip.address()
  }
  try {
    app.listen({ port: process.env.PORT, host: host })
    logger.info(
      `Server ready at http://${host}:${process.env.PORT}`,
      { label }
    )
    if (process.env.NODE_ENV === 'production') {
      console.info(
        `Server ready at http://${host}:${process.env.PORT} `, { label })
    }
  } catch (err) {
    logger.error('Fastify ERROR', err, { label })
    process.exit(1)
  }
}
start()