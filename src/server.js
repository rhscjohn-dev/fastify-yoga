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
logger.info(`NODE_ENV: ${process.env.NODE_ENV}`, { label })


// set up the fastify server
// const autoload = require('@fastify/autoload')
const app = require('fastify')({ logger: false })
// Declare a route
app.get('/', async (request, reply) => {
  return { hello: 'world' }
})

// Run the server!
const start = async () => {
  try {
    const resp = await app.listen({ port: 4000 })
    console.info("server listening on: ", resp)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}
start()