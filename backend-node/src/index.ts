import 'dotenv/config'
import { Elysia } from 'elysia'
import { swagger } from '@elysiajs/swagger'
import { cors } from '@elysiajs/cors'
import { node } from '@elysiajs/node'
import { apiRoutes } from './routes/api'

const app = new Elysia({ adapter: node() })
    .use(swagger())
    .use(cors())
    .get('/', () => ({ message: 'SQL Agent API with Database is running (Node.js)' }))
    .get('/health', () => ({ status: 'healthy', environment: 'node' }))
    .use(apiRoutes)
    .listen(8001)

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`)
