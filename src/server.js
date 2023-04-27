//  get the correct dotenv loaded
let dotenv
if (process.env.NODE_ENV === 'production') {
  dotenv = require('dotenv').config({ path: `${process.cwd()}/prod.env` })
} else {
  process.env.NODE_ENV = 'development'
  dotenv = require('dotenv').config({ path: `${process.cwd()}/dev.env` })
}

const os = require('node:os');
const ip = require('ip')
const path = require('node:path');
const { statSync } = require('node:fs')
const { childProcessExecFile } = require('./utils');
const { memCache } = require("./nodeCache");
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
try {
  statSync(process.env.FFMPEG_PATH)
  logger.info('ffmpeg path exists.', { label });
}
catch (err) {
  logger.error(`ffmpeg path: ${process.env.FFMPEG_PATH} does not exist! `, err, { label });
}
// verify existence of QSVEnc folder
try {
  statSync(process.env.QSVENC_PATH)
  logger.info('QSVEnc path exists.', { label });
} catch (err) {
  logger.error(`QSVEnc path: ${process.env.QSVENC_PATH} does not exist! `, err, { label });
}
// Verify that the interface to Node Child process function: child_process.execFile(file[, args][, options][, callback])
// is working
if (process.env.NODE_ENV === 'development') {
  childProcessExecFile('node', ['--version'])
    .then(response => {
      logger.info(`child-process[node] resp: ${response.child.exitCode} ${response.stdout}`, { label })
    })
    .catch(err => {
      logger.error(`child-process[node] error:`, err, { label })
    })
}
//setup NodeCache
logger.info('Setting up NodeCache ...', { label });
logger.info('NodeCache statistics: %o', memCache.getStats(), { label })
// setup Users in  NodeCache
if (memCache.set('Users', Users = new Map(), 0)) {
  logger.info(`In-memory DB for Users created in NodeCache`, { label })
} else {
  logger.error(`In-memory DB for Users failed in Node-Cache!`, { label })
}
process.on('SIGINT', () => {
  logger.info('SIGINT signal received.', { label });
  logger.info('nodeCache statistics: %o', memCache.getStats(), { label })
  memCache.flushAll()
  logger.info('Closing fastify server.', { label });
  logger.end()
  app.close().then(() => {
    console.log('fastify.close successfully closed!')
  }, (err) => {
    console.error('fastify.close - an error happened', err)
  })
  //close database ?
});

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