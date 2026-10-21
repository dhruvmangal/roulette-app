import bodyParser from 'body-parser'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import morgan from 'morgan'
import passport from 'passport'
import swaggerUi from 'swagger-ui-express'
import i18n from '~/libs/i18n'
import routes from './routes'
import errorHandlerMiddleware from './middlewares/errorHandler.middleware'
import initPassport from './middlewares/passport'
import rateLimiter from './middlewares/rateLimiter.middleware'
import config from '~/configs/app.config'
import swaggerSpec from '~/configs/swagger.config'

const app = express()

// Behind a proxy every request comes from the proxy's address; trusting that
// many hops makes req.ip (and so the rate limits) see the real client.
app.set('trust proxy', config.get('trustProxy'))

app.use(helmet())
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }))
app.use(bodyParser.json({ limit: '1mb' }))
app.use(cookieParser())
app.use(morgan('tiny'))
app.use(i18n.init)

// CORS Configuration
const corsOptions = {
  credentials: true,
  origin: config.get('origin') === '*' ? true : config.get('origin').split(','),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
}

app.use(cors(corsOptions))

initPassport()
app.use(passport.initialize())

// Global default rate limit — a safety net for every route. Apply a
// stricter, per-route `rateLimiter({...})` (see the middleware file) on
// top of this for anything sensitive (login, OTP, password reset).
app.use(rateLimiter({ windowMinutes: 1, max: 300 }))

if (config.get('env') !== 'production') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))
}

app.use(routes)

app.use(async (req, res) => {
  res.status(404).json({ data: {}, errors: [{ name: 'NotFound', description: 'Not Found' }] })
})

app.use(errorHandlerMiddleware)

export default app
