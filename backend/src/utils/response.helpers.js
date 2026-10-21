import _ from 'lodash'
import BaseError from '~/errors/base.error'
import * as errorTypes from './constants/errors'
import { extractErrorAttributes } from './error.utils'

/**
 * Standard way to send a REST response from a controller once a service has finished running.
 * Always resolves to `{ data, errors }` via the responseValidationMiddleware pipeline.
 */
export const sendResponse = ({ req, res, next }, { successful, result, serviceErrors, defaultError }) => {
  if (successful && !_.isEmpty(result)) {
    res.payload = { data: result, errors: [] }
    next()
  } else {
    if (!_.isEmpty(serviceErrors)) {
      // executed when addError is called from service
      const responseErrors = extractErrorAttributes(serviceErrors).map(([errorAttr, details]) => ({ ...(errorTypes[errorAttr] || { errorAttr }), details }))
      return next(responseErrors)
    }
    const responseError = new BaseError({ ...defaultError })
    next(responseError)
  }
}

/**
 * Standard way to send a socket ack response from a handler once a service has finished running.
 */
export const sendSocketResponse = ({ resCallback }, { successful, result, serviceErrors, defaultError }) => {
  if (successful && !_.isEmpty(result)) {
    return resCallback({ data: result, errors: [] })
  } else {
    if (!_.isEmpty(serviceErrors)) {
      // Same shape as sendResponse: extractErrorAttributes yields [attribute, details] pairs.
      const responseErrors = extractErrorAttributes(serviceErrors).map(([errorAttr, details]) => ({ ...(errorTypes[errorAttr] || { errorAttr }), details }))
      return resCallback({ data: {}, errors: responseErrors })
    }
    const responseError = new BaseError({ ...defaultError })
    return resCallback({ data: {}, errors: [responseError] })
  }
}
