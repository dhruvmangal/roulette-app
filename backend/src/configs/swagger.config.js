import swaggerJsdoc from 'swagger-jsdoc'
import config from './app.config'

/**
 * Generates an OpenAPI spec from `@openapi` JSDoc comments on route files.
 * Served at /api-docs (non-production only, see rest-resources/index.js).
 * Add more route file globs to `apis` as you add resources.
 */
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: config.get('app.name'),
      version: '1.0.0',
      description: 'API documentation, generated from route JSDoc comments.'
    },
    servers: [{ url: '/api/v1' }]
  },
  apis: ['./src/rest-resources/routes/**/*.routes.js', './dist/src/rest-resources/routes/**/*.routes.js']
})

export default swaggerSpec
