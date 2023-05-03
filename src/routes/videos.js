const { statSync, createReadStream } = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { setTimeout } = require('node:timers');
const { childProcessExecFile, formatBytes } = require('../utils');
const logger = require('../logger');
const label = path.basename(__filename);


let noSleepTimer = null // Nodejs timer used to prevent Win10 from going to sleep during video playback
const getVideoOpts = {
  schema: {
    query: {
      type: 'object',
      properties: { file: { type: 'string', minLength: 5 } },
      required: ['file'],
    }
  },
  errorHandler: (error, request, reply) => {
    // reformat from object to string
    logger.error(`Id: ${request.id} reply.statusCode: ${reply.statusCode}`, error, { label })
    reply.send(error.message)
  }
}

function videos (fastify, options, done) {
  fastify.get('/video/:file', getVideoOpts, async (request, reply) => {

    const { file } = request.query

    try {
      const stat = statSync(file)
      const fileType = path.extname(file)
      logger.debug(`file type(ext): ${fileType}`, { label })
      switch (fileType) {
        case '.mp4':
          const fileSize = stat.size
          const range = request.headers.range;
          if (!range) {
            throw new Error("Header must contain range");
          }
          // setup chunk size (how much data to send back)
          const chunkSize = process.env.VIDEO_CHUNK_SIZE * 1024 * 1024
          const start = Number(range.replace(/\D/g, ""));
          const end = Math.min(start + chunkSize, fileSize - 1);
          logger.verbose(` start: ${start} end: ${end} CHUNK_SIZE: ${chunkSize}`, { label })
          const contentLength = end - start + 1;
          // setup reply headers
          const headers = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': contentLength,
            'Content-Type': 'video/mp4',
          }
          // create a read stream for this particular video chunk
          const videoStream = createReadStream(file, { start, end })
            .on("open", function () {
              logger.info(`on.open createReadStream() has started on ${this.path} start: ${formatBytes(start)} end: ${formatBytes(end)} file size: ${formatBytes(fileSize)}`, { label })
            })
            .on('error', function (err) {
              logger.error('on.error createReadStream() error: ', err, { label })
              reply.raw.end(err)
            })
            .on('close', function () {
              logger.info(`on.close createReadStream() finished for ${this.path}`, { label })
            })
          // send the reply
          // maybe reply.send(require('fs').createReadStream('./10GB-File.txt'))
          reply
            .code(206)
            .headers(headers)
            .send(videoStream)
          break;
        // case '.m3u8':

        //   fs.readFile(file, 'utf8', function (err, data) {
        //     if (err) {
        //       logger.error('readFile() error: ', err, { label })
        //       throw new Error(err.message)
        //     }
        //     if (data) {
        //       var ae = request.headers['accept-encoding'];
        //       if (ae) {
        //         const headers = {
        //           'Content-Type': 'application/vnd.apple.mpegurl'
        //         };
        //         reply
        //           .headers(headers)
        //           .code(200)
        //           .compress(data)

        //       } else {
        //         reply
        //           .headers({
        //             'Content-Type': 'application/vnd.apple.mpegurl'
        //           })
        //           .code(200)
        //           .send(data)
        //       }
        //     } else {
        //       throw new Error(`file: ${file} appears empty`)
        //     }
        //   })
        //   break;
        default:
          throw new Error(`Invalid file type(ext): ${fileType} . Valid types are .mp4, m3u8.`)
      }
      // Windows 10, 11 will goto to sleep during disk I/O
      if (os.type == 'Windows_NT') {
        if (noSleepTimer) {
          noSleepTimer.refresh()
          logger.info('noSleepTimer: refreshed', { label })
        } else {
          childProcessExecFile('powercfg', ['/Change', 'standby-timeout-ac', '0'])
            .then(response => {
              logger.info(`child-process[powercfg] resp: ${response.child.exitCode} ${response.stdout}`, { label })
              noSleepTimer = setTimeout(() => {
                clearTimeout(noSleepTimer)
                noSleepTimer = null
                logger.info(`noSleepTimer: expired.  Resetting powercfg: standby-timeout-ac ${process.env.VIDEO_STANDBY_TIMEOUT}`, { label })
                childProcessExecFile('powercfg', ['/Change', 'standby-timeout-ac', process.env.VIDEO_STANDBY_TIMEOUT.toString()])
                  .then(response => {
                    logger.info(`child-process[powercfg] resp: ${response.child.exitCode} ${response.stdout}`, { label })
                  })
                  .catch(err => {
                    logger.error(`child-process[powercfg] error:`, err, { label })
                  })
              }, 2 * 60 * 1000)
            })
            .catch(err => {
              logger.error(`child-process[powercfg] error:`, err, { label })
            })
        }
      }

    } catch (error) {
      throw new Error(error.message)
    }


  })
  done()
}

module.exports = videos