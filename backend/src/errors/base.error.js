export default class BaseError extends Error {
  constructor ({ name, statusCode, isOperational, description, errorCode }) {
    super(description)
    Object.setPrototypeOf(this, new.target.prototype)

    this.name = name
    this.description = description
    this.statusCode = statusCode
    this.isOperational = isOperational
    this.errorCode = errorCode

    Error.captureStackTrace(this)
  }
}
