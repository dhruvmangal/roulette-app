function isTrustedError (error) {
  return error?.isOperational || false
}

function getLocalizedError (error, i18n) {
  const localizedError = {
    name: i18n(error.name),
    description: i18n(error.description),
    errorCode: error.errorCode,
    fields: error.fields,
    details: error.details || ''
  }

  return localizedError
}

function extractErrorAttributes (errors) {
  const errorAttributes = []
  for (const serviceName in errors) {
    if (Object.hasOwnProperty.call(errors, serviceName)) {
      const serviceErrors = errors[serviceName]
      for (const errAttr in serviceErrors) {
        if (Object.hasOwnProperty.call(serviceErrors, errAttr)) {
          errorAttributes.push([errAttr, serviceErrors[errAttr]])
        }
      }
    }
  }
  return errorAttributes
}

export {
  isTrustedError,
  getLocalizedError,
  extractErrorAttributes
}
