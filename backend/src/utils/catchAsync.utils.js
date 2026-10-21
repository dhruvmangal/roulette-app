/**
 * Wraps an async Express handler so a rejected promise is forwarded to
 * `next(error)` instead of crashing the process or hanging the request.
 * Removes the repetitive try/catch boilerplate from every controller method.
 *
 * @example
 * static getDemos = catchAsync(async (req, res, next) => {
 *   const { result, successful, errors } = await GetDemoService.execute(...)
 *   sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
 * })
 */
export const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}
