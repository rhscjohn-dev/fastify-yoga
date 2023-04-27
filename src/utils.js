const { readdir, stat, unlink } = require('node:fs/promises');
const { readdirSync } = require('node:fs')
const path = require('node:path');
const { execFile } = require('node:child_process')
const os = require('node:os')
// const { format, differenceInSeconds } = require('date-fns');
// const { parseResolveInfo, getAliasFromResolveInfo } = require('graphql-parse-resolve-info')
const { memCache } = require('./nodeCache')
const xml2js = require('xml2js')
const logger = require('./logger');
const label = path.basename(__filename);

// param date is a valid Date string
// return localDate as a string
// function convertUtcToLocal (date) {
//   logger.debug(`Function: convertUtcToLocal() entered.`, { label });
//   logger.debug(`parameter: date contains ${date}`, { label });
//   const isoDate = new Date(date.concat('Z'));
//   const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
//   const localDate = format(isoDate, 'yyyy-MM-dd HH:mm:ss', timeZone);
//   logger.debug(
//     `Function: convertUtcToLocal() exited returning ${localDate}`,
//     { label }
//   );
//   return localDate;
// }

// param date is a vallid Date string
// return utcDate as a string
// function convertLocalToUTC (date) {
//   logger.debug(`Function: convertLocalToUTC() entered.`, { label });
//   logger.debug(`parameter: date contains ${date}`, { label });
//   const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
//   const utcDate = zonedTimeToUtc(date, timeZone);
//   logger.debug(
//     `Function: convertUtcToLocal() exited returning ${utcDate}`,
//     { label }
//   );
//   return format(utcDate, 'yyyy-MM-dd HH:mm:ss');
// }

// param startDate and endDate are vailid Date strings
// return result as number
// Note: no guarantee that seconds(:ss) will be :00.  Could be :02, :04 or even :10
// function elapsedTimeInMinutes (startDate, endDate) {
//   logger.debug(`Function: elapsedTimeInMinutes() entered.`, { label });
//   logger.debug(`parameter: startDate contains ${startDate}`, { label });
//   logger.debug(`parameter: endDate contains ${endDate}`, { label });
//   dateLeft = new Date(endDate);
//   dateRight = new Date(startDate);
//   diffInMinutes = differenceInSeconds(dateLeft, dateRight) / 60;
//   result = Math.round(diffInMinutes);
//   logger.debug(
//     `Function: elapsedTimeInMinutes() exited returning ${result}.`,
//     { label }
//   );
//   return result;
// }

//
// formatMutationError
// Graphql Mutation(s) will will return a type
// with the following basic fields:
//  success
//  code
//  message
//  validationErrors
//
function formatMutationError (err) {
  // determine error Type
  logger.debug(`Function: formatMautationError() entered.`, { label });
  let errorType = 'other';
  if (err.name === 'UserInputError') {
    errorType = 'graphql';
  } else if (err.name === 'ValidationError') {
    errorType = 'yup';
  } else if (err.code) {
    if (err.code.includes('SQLITE_')) errorType = 'sqlite';
  }
  logger.debug(`variable: errorType contains: ${errorType}`, label);
  errObj = {};
  switch (errorType) {
    case 'graphql':
      errObj = {
        success: false,
        message: err.message,
        code: err.extensions.code,
        type: errorType,
        input: null
      };
      break;

    case 'sqlite':
      errObj = {
        success: false,
        message: `Error Nmbr: ${err.errno} - ${err.message}`,
        code: err.code,
        type: errorType,
        input: null
      };
      break;
    case 'yup':
      errObj = {
        success: false,
        code: 'YUP_VALIDATION_FAILED',
        message: err.message,
        validationErrors: err.errors,
        type: errorType,
        input: null
      };
      break;
    case 'other':
      errObj = {
        success: false,
        code: 'other',
        message: err.message,
        type: errorType,
        input: null
      };
      break;
  }
  logger.debug(`Function: formatMautationError() exited.`, { label });
  return errObj;
}
//
// read a directory and return an Object 
// only for files with extension of .png or .jpg
// 
// return Object {name - the name of the file,
// ext- the extension for the file,
// path - the complete/static path to the file}
//
async function rreaddir (dir, allFiles = []) {
  logger.debug(`Function: rreaddir() entered.`, { label });
  logger.debug(`parameter: dir contains ${dir}`, { label });
  const files = (await readdir(dir)).map(f => path.join(dir, f));
  allFiles.push(...files);
  await Promise.all(
    files.map(
      async f => (await stat(f)).isDirectory() && rreaddir(f, allFiles)
    )
  );
  let obj = [];
  imageExt = new RegExp('.png|.jpg')
  allFiles.forEach(fileName => {
    const ext = path.parse(fileName).ext;
    if (imageExt.test(ext)) {
      const name = path.parse(fileName).name;
      const filepath = path.resolve(fileName);
      const newObj = { name: name, ext: ext, path: filepath };
      obj = obj.concat(newObj);
    }

  });
  logger.debug(`Function: rreaddir() exited.`, { label });
  return obj;
}

//
// turn the content(files) of the channel logo directory
// into an object
//
function buildChannelLogo () {
  logger.debug(`Function: buildChannelLogo() entered.`, { label });
  pathChannel = path.join(
    config.get('pathNPVR'),
    config.get('pathChannel'))
  return rreaddir(pathChannel)
    .then(result => {
      // transform Channel Logo into Array of key, value pairs
      logger.info(`${pathChannel} has ${result.length} entries`, { label });
      const keys = result.map(logo => {
        obj = { ext: logo.ext, path: logo.path }
        return { key: logo.name, val: obj, ttl: 0 }
      })
      logger.debug(`Function: builChannelLogo() exited.`, { label });
      return keys
    })
    .catch(err => {
      logger.error('buildChannelLogo() error: ', err, { label });
      return []
    });
};

//
// turn the content(files) of the artwork directory
// into an Object
//
function buildArtwork () {
  logger.debug(`Function: buildArtwork() entered.`, { label });
  pathArtwork = path.join(
    process.env.PATH_NPVR,
    process.env.PATH_Artwork
  );
  return rreaddir(pathArtwork)
    .then(result => {
      logger.info(`${pathArtwork} has ${result.length} entries`, { label });
      // group artWork images by show name
      const groupByName = result.reduce((entryMap, image) => {
        // worst case for name: Magnum P.I._02971537.fanart
        let type
        let name
        if (image.name.endsWith('.fanart')) {
          type = "fanart"
          name = image.name.slice(0, image.name.lastIndexOf('.fanart'))
        }
        else if (image.name.endsWith('.landscape')) {
          type = "landscape"
          name = image.name.slice(0, image.name.lastIndexOf('.landscape'))
        }
        else if (image.name.endsWith('.banner')) {
          type = "banner"
          name = image.name.slice(0, image.name.lastIndexOf('.banner'))
        }
        else {
          type = 'poster'
          name = image.name
        }
        // most file names will have only one '_'
        // but show name with ':' will have the ':' converted to '_' in the file name
        // Ex  show: 'Jumanji: The Next Level' file: 'Jumanji_ The Next Level_MV01111161.fanart.jpg'
        let adjustedName
        if (name.indexOf('_') === -1) {
          adjustedName = name
        } else adjustedName = name.slice(0, Math.max(name.indexOf('_'), name.lastIndexOf('_')))

        let obj = {}
        obj[type] = {}  //top level object
        obj[type] = image.path
        entryMap.set(adjustedName, Object.assign(entryMap.get(adjustedName) || {}, obj))
        return entryMap
      }, new Map())
      // now transform the gouping into Array of key, value pairs
      const keys = []
      groupByName.forEach((value, key) => {
        obj = { ...value }
        keys.push({ key: key, val: obj, ttl: 300 })
      })
      logger.debug(`Function: buildArtWork() exited.`, { label });
      return keys;
    })
    .catch(err => {
      logger.error('buildArtwork() error:', err, { label });
      return []
    });
};

// Extract all children from the parent element
// param xml is a string xml content that should contain the parent
// param element is name of parent to extract
// return xmlString
function extractXmlParent (xml, element) {
  logger.debug(`Function: extractXmlParent() entered.`, { label });
  logger.debug(`parameter: element contains ${element}`, { label });
  openTag = '<'.concat(element).concat('>');
  closeTag = '</'.concat(element).concat('>');
  start = xml.indexOf(openTag);
  end = xml.indexOf(closeTag) + closeTag.length;
  xmlString = xml.substring(start, end);
  logger.debug(`Function: extractXmlParent() exited.`, { label });
  return xmlString;
}

//
// remove file(s) from a directory/folder based on just the name(ext not included)
// unlink returns undefined if successfull
// parameter: PATH_ - absolute path to directory/folder
// parameter: fileName - name of the file to delete(ext not included)
async function filesDelete (pathToFolder, fileToDelete) {
  logger.debug(`Function: filesDelete() entered with param(s): ${pathToFolder}, ${fileToDelete}`, { label });
  const regex = RegExp(`${fileToDelete}*`)
  try {
    const files = await readdir(pathToFolder)
    const unlinkPromises = files.reduce((list, file) => {
      const name = path.parse(file)
      if (regex.test(name.name)) {
        list.push(unlink(path.join(pathToFolder, name.base)))
      }
      return list
    }, [])

    logger.debug(`Function: deleteFiles() exited.`, { label });
    return Promise.all(unlinkPromises)
  } catch (err) {
    logger.error(`filesDelete() error: `, err, { label })
    return []
  }
}

//
// kill process using pid 
// return promise 
// param pid {integer}
// param signal {string} default SIGTERM
// param timeout {integer} default 1000
async function killProcess (pid, signal = 'SIGKILL', timeout = 1000) {
  logger.verbose(`Function: killProcess() entered with param(s): ${pid}, ${signal}, ${timeout}`, { label });
  return new Promise((resolve, reject) => {

    let count = 0;
    const i = setInterval(() => {

      try {
        process.kill(pid, signal);
      } catch (e) {
        // the process does not exists anymore
        clearInterval(i)
        logger.info(`killProcess() killed process: ${pid} with signal ${signal} after ${count}ms`, { label })
        resolve(`${pid}`);
      }
      if ((count += 200) > timeout) {
        logger.error(`killProcess() failed to kill process: ${pid} after ${count}ms`, { label })
        clearInterval(i)
        reject(new Error(`failed to kill process: ${pid}`), { label })
      }
    }, 200)
  })
}
//
// run a node Child Process
// param {string} file - Name of external to run.  include path if file not included in environmental variable PATH
// param {array} args - must be an array of parameters that the program will accept
// param {object) options - See child_process.exec node docs
async function childProcessExecFile (file, args, options) {
  logger.debug(`Function: childProcessExecFile() entered with param(s): ${file}, ${args}, ${options} `, { label });
  options || (options = {})
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, options, (err, stdout, stderr) => {
      if (err) {
        logger.error(`child_process[${child.spawnfile}]error: `, err, { label })
        reject(err)
      } else {
        resolve({ child: child, stdout: stdout, stderr: stderr })
      }
    })
    child.on('exit', (code) => {
      logger.info(`child_process[${child.spawnfile}]: on.exit with code: ${code} `, { label })
    })
    child.on('error', (error) => {
      logger.error(`child_process[${child.spawnfile}]: on.error`, error, { label })
    })
  })
}

// function doesFieldObjectExist
// Examine the Graphql AST for a specific field
// param {string} field - name of the grapgql field to find
// param {object} info - graphql info object
// returns {object}
/* {
  name: 'scheduledRecordings',
  alias: 'scheduledRecordings',
  args: {
    filterBy: [
      [Object: null prototype] { column: 'status', value: '0' },
      [length]: 1
    ]
  },
  fieldsByTypeName: {
    ScheduledRecording: {
      status: {
        name: 'status',
        alias: 'status',
        args: {},
        fieldsByTypeName: {}
      }
    }
  }
} */
function fieldObjectExist (field, info) {
  logger.debug(`Function: fieldObjectExist() entered with param(s): ${field}, ${info} `, { label });
  let nestedObj = {}
  // parse the Graphql Info object
  const alias = getAliasFromResolveInfo(info);
  const parsed = parseResolveInfo(info);
  // recursive iteration parsed looking for field
  const iterate = (obj) => {
    Object.keys(obj).forEach(key => {
      var value = obj[key]
      // Most cases 'name' will be the same value as 
      // as 'alias' and key except when query uses alias
      // Ex poster: showImage(type: "poster") {}
      if (value.name === field) {
        // console.log(`key: `, field)
        // console.dir(obj[key])
        nestedObj = obj[key]
      }

      if (typeof obj[key] === 'object') {
        iterate(obj[key])
      }
    })
  }

  iterate(parsed);
  logger.debug('Function:fieldObjectExist() exited. returned nestedObj: %o', nestedObj, { label });
  return nestedObj
}
// function formatBytes
// format bytes to human readable
// param {string} the number of bytes
// param {decimals} the number of decial places
// returns {string}
function formatBytes (bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// function processTime
// convert value to millseconds and color it green for console log
// param {bigint} time in nanoseconds as a bigint
// returns {string}
function processTime (value) {
  // return `\x1b[32m${value / 1000000n}ms\x1b[0m`;
  return `in ${value / 1000000n} ms`
}

/* function doesNestedObjectExist (field, info) {
  logger.debug(`Function: doesNestedObjectExist() entered with param(s): ${ field }, ${ info } `, { label });
  let nestedObj = {}
  const parsed = parseResolveInfo(info);

  const iterate = (obj) => {
    Object.keys(obj).forEach(key => {
      var value = obj[key]

      if (key === field) {
        // console.log(`key: `, field)
        // console.dir(obj[key])
        nestedObj = obj[key]
      }

      if (typeof obj[key] === 'object') {
        iterate(obj[key])
      }
    })
  }

  iterate(parsed);
  return nestedObj
} */

/* function doesPathExist (nodes, path) {
  if (!nodes) {
    return false;
  }

  const node = nodes.find(x => x.name.value === path[0]);

  if (!node) {
    return false;
  }

  if (path.length === 1) {
    const myNode = node.arguments
    return true;
  }

  return doesPathExist(node.selectionSet.selections, path.slice(1));
} */

// function ffmpeg
// build the command line for ffmpeg
// param {string} inputFile
// param {object} query  request.query
// param {object} metaData
// param {object Map} bitRates
// return {string} command line for ffmpeg
function ffmpeg (inputFile, query, metaData, bitRates) {
  logger.debug(`Function: ffmepg() entered with param(s): ${inputFile}, ${JSON.stringify(query)}, ${JSON.stringify(metaData)} `, { label });
  let hlsMasterName = ''
  let hlsSegmentName = ''
  let isChannel = false
  const hlsPlayListType = 'event'  // using vod will cause the master m3u8 file to be written at end of transcoding
  // set output audio encoder
  let audioCodec = ''
  let audioBitrate = 0
  if (query.ac3) {
    logger.warn('ac3 audio codec requested for audio output', { label })
    audioCodec = 'ac3'
    audioBitrate = 68000
  } else {
    audioCodec = 'aac'
    audioBitrate = 64000
  }
  //set output video encoder
  let videoEncoder = ''
  if (query.gpu) {
    videoEncoder = 'h264_qsv'
    videoDecoder = 'mpeg2_qsv'
  } else {
    videoEncoder = `libx264 -threads ${Math.floor(os.cpus().length / 2)}`
    videoDecoder = videoStream[0].codec_name
  }

  if (query.channel) {
    channel = query.channel
    params = new URL(inputFile).searchParams
    isChannel = true
    hlsMasterName = `${query.channel}_${params.get('random')}_Master.m3u8`
    hlsSegmentName = path.join(process.cwd(), `Stream/${query.channel}_${params.get('random')}_%d.ts`)
    hlsTime = 2
    outputName = path.join(process.cwd(), `Stream/${query.channel}_${params.get('random')}.m3u8`)

  }
  if (query.file) {
    hlsMasterName = `${path.basename(inputFile, path.extname(inputFile))}_Master.m3u8`
    hlsSegmentName = `Stream/${path.basename(inputFile, path.extname(inputFile))}_%d.ts`
    hlsTime = 6
    outputName = `Stream/${path.basename(inputFile, path.extname(inputFile))}.m3u8`
  }

  logger.debug('metaData: %o', metaData, { label })
  const probeSize = metaData.format.bit_rate ? Math.trunc((metaData.format.bit_rate / 8) * 2) : '2M'
  const videoStream = metaData.streams.slice(0, 1)
  const audioStreams = metaData.streams.slice(1)
  const mapOptions = "-map 0:0".split(' ')  // 1st stream(index 0) will be the video stream
  logger.info(`file contains ${metaData.format.nb_streams} streams.  ${videoStream.length} Video stream(s) and ${audioStreams.length} Audio stream(s).`, { label })
  //process video stream
  const work = videoStream[0].r_frame_rate.split('/')
  let frameRate = Number.parseFloat(work[0] / work[1]).toPrecision(5)
  const isProgressive = videoStream[0].field_order !== 'progressive' ? false : true
  const gop = Math.round(frameRate * hlsTime)
  const bitRate = bitRates.has(videoStream[0].height) ? bitRates.get(videoStream[0].height) : bitRates.get('default')
  const maxBitRate = Math.trunc(bitRate * 1.10)
  const bufferSize = Math.trunc(bitRate * 1.50)

  logger.info(`Video - codec: ${videoStream[0].codec_name}, codec type: ${videoStream[0].codec_type} profile: ${videoStream[0].profile}, duration: ${isChannel ? "n/a" : format(new Date(0, 0, 1, 0, 0, videoStream[0].duration), "H:mm:ss")}
                width: ${videoStream[0].width}, height: ${videoStream[0].height} closed captions: ${videoStream[0].closed_captions}, isProgressive: ${isProgressive}`, { label })

  //process audio stream(s) and build ffmpeg audio options
  let audioOptions = []
  let audioStream = ''
  audioStreams.forEach((stream, index) => {
    logger.info(`audio[${index}] - codec: ${stream.codec_name}, codec type: ${stream.codec_type} channels: ${stream.channels}, channel layout: ${stream.channel_layout}, bit rate: ${stream.bit_rate}.`, { label })
    audioStream = `-c:a:${index} ${audioCodec} -ac:a:${index} ${stream.channels} -b:a:${index} ${stream.channels * audioBitrate}`.split(' ')

    audioOptions = audioOptions.concat(audioStream)
    mapOptions.push('-map', `0:${index + videoStream.length}`)
  })
  // ffmpeg note:  make sure there is only 1 space between options
  //              -loglevel info will flood strderr.  use only for debugging ffmpeg
  globalOptions = `-loglevel error -hide_banner -y -probesize ${probeSize} -analyzeduration 0`.split(' ')

  // build ffmpeg input file options
  const inputOptions = `-c:v ${videoDecoder} -i`.split(' ')
  inputOptions.push(`${inputFile}`)
  if (query.channel) {
    inputOptions.unshift('-re') //tells ffmpeg to read the input at the input file frame rate
  }
  // build ffmpeg video output options
  const videoOptions = `-c:v ${videoEncoder} -preset fast -profile:v high -level 4.1 -async_depth 4 -sc_threshold 0 -g ${gop} -b:v:0 ${bitRate} -maxrate:v:0 ${maxBitRate} -bufsize:v:0 ${bufferSize}`.split(' ')
  if (!isProgressive) {
    videoOptions.push('-vf', 'yadif') //or try bwdif instead of yadif
  }

  // check for closed captions
  if (videoStream[0].closed_captions === 1) {
    audioOptions.push('-c:s', 'srt')
  }

  // build ffmpeg hls options
  const hlsOptions = `-start_number 0 -hls_time ${hlsTime} -hls_list_size 0 -hls_playlist_type ${hlsPlayListType} -hls_segment_type mpegts -f hls`.split(' ')
  hlsOptions.push('-hls_segment_filename', `${hlsSegmentName}`)
  hlsOptions.push('-master_pl_name', `${hlsMasterName}`)
  // build ffmpeg output file 
  const outputOptions = []
  outputOptions.push(`${outputName}`)
  //bring all of options together
  const cmdLine = globalOptions.concat(inputOptions, mapOptions, videoOptions, audioOptions, hlsOptions, outputOptions)

  logger.debug('Function: ffmpeg() exited. returned  %s', cmdLine, { label });
  return { cmdLine: cmdLine, hlsMasterName: hlsMasterName }
}
// function qsvenc
// build the command line for ffmpeg
// param {string} inputFile
// param {object} query  request.query
// param {object} metaData
// param {object} bitRates
// return {object} 
// QSVEnc bitrates are  specified in kbps
function qsvenc (inputFile, query, metaData, bitRates) {
  logger.debug(`Function: qsvenc() entered with param(s): ${inputFile}, ${JSON.stringify(query)}, ${JSON.stringify(metaData)} `, { label });
  let hlsMasterName = ''
  let hlsSegmentName = ''
  let isChannel = false
  const hlsPlayListType = 'event'  // using vod will cause the master m3u8 file to be written at end of transcoding
  // set output audio encoder
  let audioCodec = ''
  let audioBitrate = 0
  if (query.ac3) {
    logger.warn('ac3 audio codec requested for audio output', { label })
    audioCodec = 'ac3'
    audioBitrate = 68000
  } else {
    audioCodec = 'aac'
    audioBitrate = 64000
  }
  //set output video encoder
  let videoDecoder = ''
  if (query.gpu) {
    videoDecoder = '--avhw'
  } else {
    videoDecoder = `--avsw`
  }
  if (query.channel) {
    channel = query.channel
    params = new URL(inputFile).searchParams
    isChannel = true
    hlsMasterName = `${query.channel}_${params.get('random')}_Master.m3u8`
    hlsSegmentName = path.join(process.cwd(), 'Stream', `${query.channel}_${params.get('random')}_%04d.ts`)
    hlsTime = 2
    outputName = path.join(process.cwd(), 'Stream', `${query.channel}_${params.get('random')}.m3u8`)
  }
  if (query.file) {
    hlsMasterName = `${path.basename(inputFile, path.extname(inputFile))}_Master.m3u8`
    hlsSegmentName = path.join('Stream', `${path.basename(inputFile, path.extname(inputFile))}_%04d.ts`)
    hlsTime = 6
    outputName = path.join('Stream', `${path.basename(inputFile, path.extname(inputFile))}.m3u8`)
  }

  logger.verbose('metaData: %o', metaData, { label })
  const probeSize = metaData.format.bit_rate ? Math.trunc((metaData.format.bit_rate / 8) * 2) : '2M'
  const videoStream = metaData.streams.slice(0, 1)
  const audioStreams = metaData.streams.slice(1)
  // const mapOptions = "-map 0:0".split(' ')  // 1st stream(index 0) will be the video stream
  logger.info(`file contains ${metaData.format.nb_streams} streams.  ${videoStream.length} Video stream(s) and ${audioStreams.length} Audio stream(s).`, { label })
  //process video stream
  const work = videoStream[0].r_frame_rate.split('/')
  let frameRate = Number.parseFloat(work[0] / work[1]).toPrecision(5)
  const isProgressive = videoStream[0].field_order !== 'progressive' ? false : true
  const gop = Math.round(frameRate * hlsTime)
  const bitRate = bitRates.has(videoStream[0].height) ? bitRates.get(videoStream[0].height) / 1000 : bitRates.get('default') / 1000
  const maxBitRate = Math.trunc(bitRate * 1.10)
  const bufferSize = Math.trunc(bitRate * 1.50)

  logger.info(`Video - codec: ${videoStream[0].codec_name}, codec type: ${videoStream[0].codec_type}
                profile: ${videoStream[0].profile}, duration: ${isChannel ? "n/a" : format(new Date(0, 0, 1, 0, 0, videoStream[0].duration), "H:mm:ss")}
                width: ${videoStream[0].width}, height: ${videoStream[0].height}
                closed captions: ${videoStream[0].closed_captions}, isProgressive: ${isProgressive}`, { label })

  //process audio stream(s) and build qsvenc audio options
  let audioOptions = []
  audioStreams.forEach((stream, index) => {
    logger.info(`audio[${index}] - codec: ${stream.codec_name}, codec type: ${stream.codec_type}
                channels: ${stream.channels}, channel layout: ${stream.channel_layout}, bit rate: ${stream.bit_rate}.`, { label })
    let audioStream = ""
    if (stream.channels === 2) {
      audioStream = 'stereo'
    }
    if (stream.channels === 6) {
      audioStream = "5.1"
    }
    let audio = `--audio-codec ${index + 1}?${audioCodec} --audio-bitrate ${index + 1}?${stream.channels * audioBitrate} --audio-stream ${index + 1}?${audioStream}`.split(' ')
    // let audio = `--audio-codec ${index + 1}?${audioCodec} --audio-bitrate ${index + 1}?${stream.channels * audioBitrate}`.split(' ')
    audioOptions = audioOptions.concat(audio)
  })

  // build qsvenc input file options
  const inputOptions = []
  inputOptions.push('-i', `${inputFile}`)

  // build qsvenc video output options
  // const videoOptions = `${videoDecoder} --codec h264 --quality fast --profile high --level 4.1 --async-depth 4 --gop-len ${gop} --cbr 21 --max-bitrate ${maxBitRate} --vbv-bufsize ${bufferSize}`.split(' ')
  const videoOptions = `${videoDecoder} --input-probesize ${probeSize} --codec h264 --quality fast --profile high --level 4.1 --gop-len ${gop} --vbr ${bitRate} --max-bitrate ${maxBitRate} --vbv-bufsize ${bufferSize}`.split(' ')
  if (!isProgressive) {
    videoOptions.push('--vpp-deinterlace', 'normal')
    videoOptions.push('--interlace', 'tff')
  }
  // check for closed captions
  if (videoStream[0].closed_captions === 1) {
    // audioOptions.push('--sub-copy', '1')
  }
  // build hlsOptions
  const hlsOptions = `-m start_number:0 -m hls_time:${hlsTime} -m hls_list_size:0 -m hls_playlist_type:${hlsPlayListType} -m hls_segment_type:mpegts -f hls`.split(' ')
  hlsOptions.push('-m', `hls_segment_filename:${hlsSegmentName}`)
  hlsOptions.push('-m', `master_pl_name:${hlsMasterName}`)
  // build qsvenc output file 
  const outputOptions = []
  outputOptions.push('-o', `${outputName}`)

  //bring all of options together
  const cmdLine = videoOptions.concat(audioOptions, hlsOptions, inputOptions, outputOptions)
  logger.debug('Function: qsvenc() exited. returned  %s', cmdLine, { label });
  return { cmdLine: cmdLine, hlsMasterName: hlsMasterName }

}

// function FindOne
// build Knex query to find 1 record
// param {object} db  Knex instance
// param {string} table  name of table in database
// param {object} key
// return {object} Knex command
function findOne (db, table, key) {
  const command = db(table).select()
    .where(key)
    .on('query', data => logger.info(`findOne SQL: ${data.sql}`, { label }))
  return command
}

// function findMany
// build Knex query to find 1 record
// param {object} db  Knex instance
// param {string} table  name of table in database
// param {object} args
// return {object} Knex command
function findMany (db, table, args) {
  const command = db(table).select()
    .modify(queryBuilder => {
      if (args.hasOwnProperty('filters')) {
        objFilters = Object.assign({}, args.filters)
        Object.keys(objFilters).forEach(key => {
          switch (key) {
            case 'Where':
              objFilters.Where.forEach(obj => {
                queryBuilder.where(obj.column, obj.operator, obj.value)
              })
              break;
            case 'Not':
              objFilters.Not.forEach(obj => {
                queryBuilder.whereNot(obj.column, obj.operator, obj.value)
              })
              break;
            case 'And':
              queryBuilder.where(objFilters.And.column, objFilters.And.operator, objFilters.And.value)
              break;
            case 'Or':
              queryBuilder.whereOr(objFilters.And.column, objFilters.And.operator, objFilters.And.value)
              break;
            case 'Between':
              objFilters.Between.forEach(obj =>
                queryBuilder.whereBetween(obj.column, obj.range)
              );
              break;
            case 'In':
              objFilters.In.forEach(obj =>
                queryBuilder.whereIn(obj.column, obj.values)
              );
              break;
            case 'Sort':
              objFilters.Sort.forEach(obj =>
                queryBuilder.orderBy(obj.column, obj.order)
              )
              break
            case 'Limit':
              queryBuilder.limit(objFilters.Limit)
              break
            case 'Offset':
              queryBuilder.offset(objFilters.Offset)
              break
            default:
              throw `undefinded filter key(${key}) found in object args.filters`
          }
        })
      }
    })
    .on('query', data => logger.info(`findMany SQL: ${data.sql}`, { label }))
  return command
}

// function count
// build Knex query to count records
// param {object} db  Knex instance
// param {string} table  name of table in database
// param {object} args
// return {object} Knex command
function count (db, table, args) {
  const command = db(table)
    .modify(queryBuilder => {
      if (args.hasOwnProperty('column')) {
        queryBuilder.count(args.column)
      }
    })
    .modify(queryBuilder => {
      if (args.hasOwnProperty('filters')) {
        objFilters = Object.assign({}, args.filters)
        Object.keys(objFilters).forEach(key => {
          switch (key) {
            case 'Where':
              objFilters.Where.forEach(obj => {
                queryBuilder.where(obj.column, obj.operator, obj.value)
              })
              break;
            case 'Not':
              objFilters.Not.forEach(obj => {
                queryBuilder.whereNot(obj.column, obj.operator, obj.value)
              })
              break;
            case 'And':
              queryBuilder.where(objFilters.And.column, objFilters.And.operator, objFilters.And.value)
              break;
            case 'Or':
              queryBuilder.whereOr(objFilters.And.column, objFilters.And.operator, objFilters.And.value)
              break;
            case 'Between':
              objFilters.Between.forEach(obj =>
                queryBuilder.whereBetween(obj.column, obj.range)
              );
              break;
            case 'In':
              objFilters.In.forEach(obj =>
                queryBuilder.whereIn(obj.column, obj.values)
              );
              break;
            // case 'Sort':
            //   objFilters.Sort.forEach(obj =>
            //     queryBuilder.orderBy(obj.column, obj.order)
            //   )
            //   break
            // case 'Limit':
            //   queryBuilder.limit(objFilters.Limit)
            //   break
            // case 'Offset':
            //   queryBuilder.offset(objFilters.Offset)
            //   break
            default:
              throw `undefinded filter key(${key}) found in object args.filters`
          }
        })
      }
    })
    .on('query', data => logger.info(`count SQL: ${data.sql}`, { label }))
  return command
}
// function deleteOne
// build Knex query to delete 1 record
// param {object} db  Knex instance
// param {string} table  name of table in database
// param {object} key
// return {object} Knex command
function deleteOne (db, table, key) {
  const command = db(table)
    .where(key)
    .on('query', data => logger.info(`deleteOne SQL: ${data.sql}`, { label }))
    .del()
  return command
}

// function createOne
// build Knex query to insert 1 record
// param {object} db  Knex instance
// param {string} table  name of table in database
// param {object} args
// return {object} Knex command
function createOne (db, table, args) {
  const command = db(table)
    .on('query', data => logger.info(`createOne SQL: ${data.sql}`, { label }))
    .insert(args.input)
  return command
}

// function updateOne
// build Knex query to update 1 record
// param {object} db  Knex instance
// param {string} table  name of table in database
// param {object} args
// return {object} Knex command
function updateOne (db, table, key, args) {
  const command = db(table)
    .where(key)
    .on('query', data => logger.info(`updateOne SQL: ${data.sql}`, { label }))
    .update(args.input)
  return command
}

// function lastInsertRowId
// build Knex query to get last insert row id
// param {object} db  Knex instance
// return {integer} value of last inserted row id
async function lastInsertRowId (db) {
  result = await db.raw('select last_insert_rowid()')
  return result[0].lastInsertRowid
}

// function distinct
// build Knex query to get distinct values for specified column
// param {object} db  Knex instance
// param {string} table  name of table in database
// param {string} column 
// return {object} Knex command
function distinct (db, table, column) {
  const command = db(table)
    .distinct(column)
  return command
}

//
// find findShowImages type for a show in a  directory and return an Object 
// only for files with extension of .png or .jpg
// 
// param {string} name part of the filename to match
// return {object}
function findShowImages (name) {
  logger.debug(`Function: findShowImages() parameters name: ${name}.`, { label });
  const dir = path.join(process.env.PATH_NPVR, process.env.PATH_ARTWORK)
  imageExt = new RegExp('.png|.jpg')
  imageName = new RegExp(name)
  let files = []

  // if the media directory is not cached then read the directory and cache it
  files = memCache.get(dir)
  if (files == undefined) {
    files = readdirSync(dir)
    memCache.set(dir, files, 15)
    logger.verbose(`findShowImages() memCache.set(${dir}, files)`, { label })
  } else {
    logger.verbose(`findShowImages() memCache.get(${dir})`, { label })
  }

  const foundShows = files.filter(file => imageExt.test(path.extname(file)) && imageName.test(path.basename(file)))
  const result = foundShows.reduce((imageObj, image) => {
    let [name, type] = path.basename(image, path.extname(image)).split('.')
    if (typeof type === 'undefined') {
      type = 'poster'
    }
    let obj = {}
    obj[type] = path.join(dir, image)
    imageObj = Object.assign(imageObj, obj)
    return imageObj
  }, {})
  logger.debug(`Function: findShowImages exited.`, { label });
  return result
}

//
// find findChannelImage in a  directory and return an Object 
// only for files with extension of .png or .jpg
// 
// param {string} name part of the filename to match
// return {object}
async function findChannelImage (name) {
  logger.debug(`Function: findChannelImage() parameters name: ${name}`, { label });
  const dir = path.join(process.env.PATH_NPVR, process.env.PATH_CHANNEL)
  imageExt = new RegExp('.png|.jpg')
  imageName = new RegExp(name)
  let files = []

  // if the media directory is not cached then read the directory and cache it
  files = memCache.get(dir)
  if (files == undefined) {
    files = readdirSync(dir)
    memCache.set(dir, files)
    logger.verbose(`findChannelImage() memCache.set(${dir}, files)`, { label })
  } else {
    logger.verbose(`findChannelImage() memCache.get(${dir})`, { label })
  }

  const foundChannel = files.filter(file => imageExt.test(path.extname(file)) && imageName.test(path.basename(file)))

  let obj = {}
  obj[name] = path.join(dir, foundChannel[0])
  result = Object.assign({}, obj)
  logger.debug(`Function: findChannelImage() exited.`, { label });
  return result
}

//
// all images for a channel in a  directory and return an Object 
// only for files with extension of .png or .jpg
// param {string} url
// retrun {object}
async function findManyChannelImages (url) {
  logger.debug(`Function: findManyChannelsImages() paramter(s) name: ${url}.`, { label });
  const dir = path.join(path.join(process.env.PATH_NPVR, process.env.PATH_CHANNEL))
  imageExt = new RegExp('.png|.jpg')
  let files = []

  // if the media directory is not cached then read the directory and cache it
  files = memCache.get(dir)
  if (files == undefined) {
    files = readdirSync(dir)
    memCache.set(dir, files)
    logger.verbose(`findManyChannelsImages() memCache.set(${dir}, files)`, { label })
  } else {
    logger.verbose(`findManyChannelsImages() memCache.get(${dir})`, { label })
  }

  const foundChannels = files.filter(file => imageExt.test(path.extname(file)))
  const result = foundChannels.map((channel) => {
    parsedFile = path.parse(path.join(dir, channel))
    logger.debug(`Function: findManyChannelsImages() exited.`, { label });
    return {
      type: 'channel',
      dir: parsedFile.dir,
      base: parsedFile.base,
      ext: parsedFile.ext,
      name: parsedFile.name
    }
  })
  return result
}
//
// all video files in a  directory and return an array of Object 
// only for files with extension of .png or .jpg
// param {string} pathToVideo
// retrun {object}
function findVideoFiles (pathToVideo) {
  logger.debug(`Function: findVideoFiles() paramter(s) pathToVideo: ${pathToVideo}.`, { label });
  const dir = pathToVideo
  mediaExt = new RegExp('.mkv|.mp4|.webm|.ts')
  let files = []

  // if the media directory is not cached then read the directory and cache it
  files = memCache.get(dir)
  if (files == undefined) {
    files = readdirSync(dir)
    memCache.set(dir, files)
    logger.verbose(`findVideoFiles() memCache.set(${dir}, files)`, { label })
  } else {
    logger.verbose(`findVideoFiles() memCache.get(${dir})`, { label })
  }

  const foundVideos = files.filter(file => mediaExt.test(path.extname(file)))
  const result = foundVideos.map((video) => {
    parsedFile = path.parse(path.join(dir, video))
    logger.debug(`Function: findVideoFiles() exited.`, { label });
    return {
      root: parsedFile.root,
      dir: parsedFile.dir,
      base: parsedFile.base,
      ext: parsedFile.ext,
      name: parsedFile.name,
      // url: `${url}${parsedFile.base}`
    }
  })
  return result
}


// function buildXmlFromObj
// param {object} input object to be converted
// param {string} rootName
// return {string} xml
function buildXmlFromObj (input, rootName) {
  logger.debug(`Function: buildXmlFromObject() paramter(s) rootName: ${rootName}, input %j.`, input, { label });
  // const obj = Object.entries(input).reduce((obj, item) => (obj[item[0]] = item[1], obj), {})
  var xmlBuilder = new xml2js.Builder({ explictRoot: false, headless: true, rootName: rootName });
  const xmlString = xmlBuilder.buildObject(input);
  logger.debug(`Function: buildXmlFromObject() exited.`, { label });
  return xmlString
}
module.exports = {
  buildChannelLogo,
  buildArtwork,
  formatMutationError,
  // elapsedTimeInMinutes,
  // convertLocalToUTC,
  // convertUtcToLocal,
  extractXmlParent,
  filesDelete,
  childProcessExecFile,
  fieldObjectExist,
  formatBytes,
  killProcess,
  processTime,
  ffmpeg,
  qsvenc,
  findOne,
  findMany,
  createOne,
  updateOne,
  deleteOne,
  lastInsertRowId,
  count,
  distinct,
  findShowImages,
  findChannelImage,
  findManyChannelImages,
  findVideoFiles,
  buildXmlFromObj
};


