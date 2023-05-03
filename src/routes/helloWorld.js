// const { fastify } = require('fastify');
const path = require('path')
const logger = require('../logger');
const label = path.basename(__filename);

const getHelloWorldOpts = {
  schema: {
    // request needs to have a parmater with a `name` parameter (required)
    params: {
      type: 'object',
      properties: {
        name: { type: 'string', default: 'fastify' }
      },
      required: ['name']
    },
    // the response needs to be an object with an `hello` property of type 'string'
    response: {
      200: {
        type: 'object',
        properties: {
          hello: { type: 'string' }

        }
      }
    },
  },
  onError: (req, reply, error, done) => {
    logger.error(`Id: ${req.id} reply.statusCode: ${reply.statusCode}`, error, { label })
    done()
  }
}

async function helloWorld (fastify, options) {
  fastify.get('/:name', getHelloWorldOpts, async (req, reply) => {
    return { hello: `${req.query.name || 'fastify'}` }
  })
}

module.exports = helloWorld