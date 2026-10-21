import { GetDemoService, CreateDemoService } from '~/services/demo'
import { sendResponse } from '~/utils/response.helpers'
import { catchAsync } from '~/utils/catchAsync.utils'

/**
 * Example controller — one class per file, static methods as route handlers.
 * Each handler is wrapped in catchAsync so a rejected promise reaches the
 * error-handling middleware instead of needing a manual try/catch here.
 */
export default class DemoController {
  static getDemos = catchAsync(async (req, res, next) => {
    const { result, successful, errors } = await GetDemoService.execute({ ...req.query }, req.context)
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })

  static createDemo = catchAsync(async (req, res, next) => {
    const { result, successful, errors } = await CreateDemoService.execute({ ...req.body }, req.context)
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })
}
