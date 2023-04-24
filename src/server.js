// Require the framework and instantiate it
import Fastify from 'fastify'
import cors from '@fastify/cors'
import * as dotenv from 'dotenv'


if (process.env.NODE_ENV === 'production') {
  dotenv.config({ path: `${process.cwd()}/prod.env` })
} else {
  process.env.NODE_ENV = 'development'
  dotenv.config({ path: `${process.cwd()}/dev.env` })
}
console.log("process.env: ", process.env)
const app = Fastify({
  logger: false
})
await app.register(cors, {
  origin: '*',
  methods: ["GET", "POST", "DELETE", "PUT", "PATCH"]
})

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