/*
  Example to start transcoding a existing video file
    http://localhost:4000/live?file=D:\Users\Public\Recorded%20TV\Last%20Man%20Standing\Last%20Man%20Standing.S08E11.Baked%20Sale.ts
     Example to start transcoding a channel(live TV)
    http://localhost:4000/live?channel=3.1
*/
const { statSync } = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { childProcessExecFile, ffmpeg, qsvenc, killProcess, filesDelete } = require('../utils.js')
const chokidar = require('chokidar');
const logger = require('../logger');
const label = path.basename(__filename);

let nmbrTranscodes = 0
//set the bit rates for the various video heights
const bitRates = new Map()
bitRates.set(480, 2500000)
bitRates.set(720, 4000000)
bitRates.set(1080, 5000000)
bitRates.set(2160, 16000000)
bitRates.set('default', 4000000)

getLiveOpts = {
  schema: {
    query: {
      type: 'object',
      properties: {
        file: { type: 'string', minLength: 5 },
        channel: { type: 'string', "pattern": "^[0-9]+([.][0-9]+)?$" },
        gpu: { type: 'boolean', "default": true },
        ac3: { type: 'boolean', "default": false },
        transcoder: { type: 'string', 'enum': ['ffmpeg', 'qsvenc'], "default": "ffmpeg" }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          pid: { type: 'integer' }
        }
      }
    }
  },
  errorHandler: (error, request, reply) => {
    // reformat from object to string
    reply.status(400).send({ msg: error.message })
    logger.error(`Id: ${request.id} reply.status: ${reply.status}`, error, { label })
  }
}

deleteLiveOpts = {
  schema: {
    query: {
      type: 'object',
      properties: {
        file: { type: 'string', minLength: 5 },
        // channel: { type: 'number', 'minimum': 1.0 },
        channel: { type: 'string', "pattern": "^[0-9]+([.][0-9]+)?$" },
        pid: { type: 'string', "pattern": "^[0-9]*[1-9][0-9]*$" }
      },
      required: ['pid']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          filesDeleted: { type: 'integer' }
        }
      }
    }
  },
  errorHandler: (error, request, reply) => {
    logger.error(`Id: ${request.id} reply.status: ${reply.status}`, error, { label })
    reply.status(400).send({ msg: error.message })
  }
}

function live (fastify, options, done) {
  fastify.get('/live', getLiveOpts, async (request, reply) => {
    logger.info('method: %s url: %s', request.method, request.url, { label })

    if (!request.query.channel && !request.query.file) {
      throw new Error('missing query paramater: channel or file')
    }
    let inputFile = ''

    if (request.query.channel) {
      // logger.info(`query live: ${req.query.channel} `, { label })
      const nextpvrUrl = new URL(`http://${process.env.NEXTPVR_HOST}:${process.env.NEXTPVR_PORT}/live?channel=${request.query.channel}&random=${nmbrTranscodes}`)
      inputFile = nextpvrUrl.href
    }
    if (request.query.file) {
      try {
        let stat = statSync(request.query.file)
      }
      catch (err) {
        throw new Error(err.message)
      }
      inputFile = request.query.file
    }
    // setup file watcher on hlsMasterName
    const fileWatcher = chokidar.watch("Stream/*_Master.m3u8", {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: false,
      cwd: process.cwd()
    });
    fileWatcher.on('ready', () => {
      logger.info('fileWatcher.onReady watching %os', fileWatcher.getWatched(), { label })
    })
    // get video/audio information using ffprobe
    const ffprobeOptions = "-v quiet -hide_banner -show_format -show_streams -print_format json -read_intervals 1%+1".split(' ')
    ffprobeOptions.push(`${inputFile}`)
    logger.info(`run ffprobe with options: ${ffprobeOptions} `, { label })
    const ffprobeResult = await childProcessExecFile(path.join(process.env.FFMPEG_PATH, 'ffprobe.exe'), ffprobeOptions)
    logger.debug(`ffprobe result: ${ffprobeResult.child.exitCode} ${ffprobeResult.stdout}`, { label })
    const metaData = JSON.parse(ffprobeResult.stdout)
    logger.verbose('metadata: %o', metaData, { label })


    if (request.query.transcoder === 'ffmpeg') {
      const { cmdLine, hlsMasterName } = ffmpeg(inputFile, request.query, metaData, bitRates)
      logger.info(`spwan (${nmbrTranscodes}) ffmpeg with options: ${cmdLine.join(' ')}`, { label })
      fileWatcher.on('add', newFile => {
        logger.info(`fileWatcher.onAdd : ${newFile}`, { label })
        if (path.basename(newFile) === hlsMasterName) {
          const url = new URL(`Stream/${encodeURIComponent(hlsMasterName)}`, `http:${request.hostname}`)
          fileWatcher.unwatch("Stream/*_Master.m3u8")
          reply.status(200).send({
            file: url, pid: ffmpegSpawn.pid
          })

        }
      })

      const ffmpegSpawn = spawn(path.join(process.env.FFMPEG_PATH, 'ffmpeg.exe'), cmdLine);
      ffmpegSpawn.on('spawn', () => {
        logger.info(`[${ffmpegSpawn.pid}] ffmpegSpawn.on(spawn) success!`, { label });
      })
      ffmpegSpawn.on('error', function (err, stdout, stderr) {
        logger.error(`[${ffmpegSpawn.pid}] ffmpegSpawn.on(error) spawn failed: ` + err.message, { label });
        logger.error(stderr, { label })
        nmbrTranscodes--
      })

      ffmpegSpawn.on('close', (code) => {
        logger.info(`[${ffmpegSpawn.pid}] ffmpegSpawn.on(close) with code: ${code}`, { label });
        // dump the contents of the strderrBuffer
        let start = 0
        for (pos = strderrBuffer.indexOf("\n"); pos != -1; pos, pos = strderrBuffer.indexOf("\n", pos + 1)) {
          const line = strderrBuffer.toString('utf8', start, pos)
          if (line.startsWith('bench: ')) {
            logger.info(`ffmpeg ${line}`, { label })
          } else {
            logger.verbose(line, { label })
          }
          start = pos + 1
        }
        strderrBuffer = Buffer.alloc(0)
      });

      ffmpegSpawn.on('exit', (code) => {
        logger.info(`[${ffmpegSpawn.pid}] ffmpegSpawn.on(exit) ${nmbrTranscodes} with code ${code}`, { label });
        nmbrTranscodes--

        if (nmbrTranscodes < 0) {
          logger.warn('Variable: nmbrTranscodes is < 0 ', { label })
          nmbrTranscodes = 0
        }
      });

      // error logging   
      let strderrBuffer = Buffer.alloc(0, ' ', "utf8")
      ffmpegSpawn.stderr.setEncoding('utf8');
      // ffmpeg.stderr.on('data', (data) => {
      //   const tmpBuffer = Buffer.from(data, 'utf8')
      //   strderrBuffer = Buffer.concat([strderrBuffer, tmpBuffer])
      // });
      ffmpegSpawn.stderr.on('data', (data) => {
        logger.debug(`[${ffmpegSpawn.pid}] stderr: ${data}`, { label })
      })

      nmbrTranscodes++
    }

    if (request.query.transcoder === 'qsvenc') {
      const { cmdLine, hlsMasterName } = qsvenc(inputFile, request.query, metaData, bitRates)
      logger.info(`spwan (${nmbrTranscodes}) qsvenc with options: ${cmdLine.join(' ')}`, { label })
      fileWatcher.on('add', newFile => {
        logger.info(`fileWatcher.onAdd : ${newFile}`, { label })
        if (path.basename(newFile) === hlsMasterName) {
          const url = new URL(`Stream/${encodeURIComponent(hlsMasterName)}`, `http:${request.hostname}`)
          fileWatcher.unwatch("Stream/*_Master.m3u8")
          reply.status(200).send({
            file: url, pid: qsvencSpawn.pid
          })
        }
      })
      const qsvencSpawn = spawn(path.join(process.env.QSVENC_PATH, 'QSVEncC64.exe'), cmdLine);
      qsvencSpawn.on('spawn', () => {
        logger.info(`[${qsvencSpawn.pid}] qsvencSpawn.on(spawn) success!`, { label });
        nmbrTranscodes++

      })
      qsvencSpawn.on('error', function (err, stdout, stderr) {
        logger.error(`[${qsvencSpawn.pid}] qsvencSpawn.on(error) spawn failed: ` + err.message, { label });
        logger.error(stderr, { label })
        nmbrTranscodes--
      })

      qsvencSpawn.on('close', (code) => {
        logger.info(`[${qsvencSpawn.pid}] qsvencSpawn.on(close) with code: ${code}`, { label });
        // dump the contents of the strderrBuffer
        let start = 0
        for (pos = strderrBuffer.indexOf("\n"); pos != -1; pos, pos = strderrBuffer.indexOf("\n", pos + 1)) {
          const line = strderrBuffer.toString('utf8', start, pos)
          if (line.startsWith('bench: ')) {
            logger.info(`qsvenc ${line}`, { label })
          } else {
            logger.verbose(line, { label })
          }
          start = pos + 1
        }
        strderrBuffer = Buffer.alloc(0)
      });

      qsvencSpawn.on('exit', (code) => {
        logger.info(`[${qsvencSpawn.pid}] qsvencSpawn.on(exit) ${nmbrTranscodes} with code ${code}`, { label });
        nmbrTranscodes--

        if (nmbrTranscodes < 0) {
          logger.warn('Variable: nmbrTranscodes is < 0 ', { label })
          nmbrTranscodes = 0
        }
      });

      // error logging   
      let strderrBuffer = Buffer.alloc(0, ' ', "utf8")
      qsvencSpawn.stderr.setEncoding('utf8');
      // qsvenc.stderr.on('data', (data) => {
      //   const tmpBuffer = Buffer.from(data, 'utf8')
      //   strderrBuffer = Buffer.concat([strderrBuffer, tmpBuffer])
      // });
      qsvencSpawn.stderr.on('data', (data) => {
        logger.debug(`[${qsvencSpawn.pid}] stderr: ${data}`, { label })
      })

    }
    await reply
    // logger.info("Existing route: /live", { label })
  })

  /*
  Example to delete the transcode file(s)
   http://localhost:4000/live?file=Brooklyn%20Nine-Nine.S07E03.Pimemento.m3u8,pid=3456
  */
  fastify.delete('/live', deleteLiveOpts, async (request, reply) => {
    logger.info('method: %s url: %s', request.method, request.url, { label })
    if (!request.query.channel && !request.query.file) {
      throw new Error('missing query paramater: channel or file')
    }

    let deleteFile = ''
    const pathToFolder = path.join(process.cwd(), 'Stream')

    if (request.query.file) {
      deleteFile = decodeURIComponent(path.basename(request.query.file, 'ts')).split('_')[0]
    }

    if (request.query.channel) {
      deleteFile = decodeURI(path.basename(request.query.channel))
    }

    if (request.query.pid) {
      killProcess(request.query.pid)
        .then(result => {
          logger.info(`process pid: ${result} is not running.`, { label })
          filesDelete(pathToFolder, deleteFile)
            .then(results => {
              if (results.length > 0) {
                logger.info(`DELETE - Number of deleted files(${deleteFile}): ${results.length}`, { label })
              } else {
                logger.warn(`DELETE - Number of deleted files(${deleteFile}): ${results.length}`, { label })
              }
              reply.status(200).send({ file: deleteFile, filesDeleted: results.length })
              // reply.status(200).send({ deletedFiles: results.length });
            })
            .catch(err => {
              throw new Error(err.msg)
            })
        })
        .catch(err => {
          throw new Error(err.message)
        })

    }
    await reply
  })

  done()
}

module.exports = live