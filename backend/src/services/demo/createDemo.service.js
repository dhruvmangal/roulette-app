import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { SUCCESS_MSG } from '~/utils/constants/success'

const schema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 }
  },
  required: ['name']
}

const constraints = ajv.compile(schema)

export class CreateDemoService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { name } = this.args
    const { dbModels: { Demo } } = this.context

    const demo = await Demo.create({ name })

    return { demo, message: SUCCESS_MSG.CREATE_SUCCESS }
  }
}
