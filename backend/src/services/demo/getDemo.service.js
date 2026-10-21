import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { pageValidation } from '~/utils/common.utils'
import { SUCCESS_MSG } from '~/utils/constants/success'

const schema = {
  type: 'object',
  properties: {
    limit: { type: ['string', 'number'] },
    pageNo: { type: ['string', 'number'] }
  },
  required: []
}

const constraints = ajv.compile(schema)

/**
 * Example service — shows the standard shape: extend ServiceBase, optionally
 * declare `constraints` (an AJV-compiled schema) for input validation, and
 * implement `run()` with the actual business logic.
 */
export class GetDemoService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { limit, pageNo } = this.args
    const { dbModels: { Demo } } = this.context

    const { pageNo: page, size } = pageValidation(pageNo, limit)

    const demos = await Demo.findAndCountAll({
      order: [['demoId', 'ASC']],
      limit: size,
      offset: (page - 1) * size
    })

    return { demos, message: SUCCESS_MSG.GET_SUCCESS }
  }
}
