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


// set up the fastify server
const Autoload = require('@fastify/autoload')
const app = require('fastify')({
  logger: false,
})
// fastify serve static image(s) 
logger.info('Setting up Fastify serving static files', { label });
const appDir = process.cwd()
const srcDir = path.dirname(require.main.filename);
logger.info('appDir: %s', appDir, { label });
logger.info('srcDir: %s', srcDir, { label });
const pathChannelLogos = process.env.NODE_ENV === 'development' ? path.join(appDir, process.env.PATH_NPVR, process.env.PATH_CHANNEL) : path.join(process.env.PATH_NPVR, process.env.PATH_CHANNEL)
const pathArtwork = process.env.NODE_ENV === 'development' ? path.join(appDir, process.env.PATH_NPVR, process.env.PATH_ARTWORK) : path.join(process.env.PATH_NPVR, process.env.PATH_ARTWORK)
const pathStreaming = path.join(appDir, 'Stream')
logger.info('Fastify static path(/channel/): %s', pathChannelLogos, { label });
logger.info('Fastify static path(/shows/): %s', pathArtwork, { label });
logger.info('Fastify static path(/Stream/) live streaming: %s', pathStreaming, { label })
app.register(require('@fastify/static'), { root: pathChannelLogos, prefix: '/channels/', decorateReply: true, maxAge: '2h' })
app.register(require('@fastify/static'), { root: pathArtwork, prefix: '/shows/', decorateReply: false, maxAge: '5m' })
app.register(require('@fastify/static'), { root: pathStreaming, prefix: '/Stream/', decorateReply: false, maxAge: false, etag: false })
// serve favicon
app.register(require('fastify-favicon'))
//  cors
app.register(require('@fastify/cors'), {
  orgin: '*'
})
// fastify routes
app.register(Autoload, { dir: path.join(__dirname, 'routes') })
// fastify hooks
app.addHook('onRequest', async (req, reply) => {
  logger.info(`Id: ${req.id} REQ ${req.routerMethod} Url: ${req.url} Path: ${req.routerPath} Params: ${JSON.stringify(req.params)} Query: ${JSON.stringify(req.query)} `, { label })
})
  .addHook('onResponse', async (req, reply) => {
    const symbol = Object.getOwnPropertySymbols(reply).find(s => {
      return String(s) === 'Symbol(fastify.reply.headers)'
    })
    const type = reply[symbol]?.['content-type']
    const length = reply[symbol]?.['content-length']
    const responseTime = reply.getResponseTime().toFixed(3)
    logger.info(`Id: ${req.id} REPLY ${reply.statusCode} Time: ${responseTime} Type: ${type} Length: ${length}`, { label })

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
//graceful shutdown of server(ctrl+c)
process.on('SIGINT', () => {
  logger.info('SIGINT signal received.', { label });
  logger.info('nodeCache statistics: %o', memCache.getStats(), { label })
  memCache.flushAll()
  logger.info('Closing fastify server.', { label });
  logger.end()
  app.close().then(() => {
    console.log('fastify.close - successful!')
  }, (err) => {
    console.error('fastify.close - an error happened', err)
  })
  //close database ?
});
