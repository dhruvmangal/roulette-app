import BaseError from './base.error'

export default class ValidationError extends BaseError {
  constructor (fields = {}, errorType) {
    super(errorType)
    this.fields = fields
  }
}
