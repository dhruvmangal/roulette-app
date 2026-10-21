import _ from 'lodash'

export const getOne = async ({
  model, data = {}, attributes = [], include = [], order = [], raw = false, transaction
}) => {
  let query = { raw, where: data, include, order }

  if (!_.isEmpty(attributes)) query = { ...query, attributes }
  if (transaction) query = { ...query, transaction }

  return model.findOne(query)
}

export const getAll = async ({
  model, data = {}, attributes = [], include = [], order = [], group = [], limit,
  offset, raw = false, transaction
}) => {
  let query = { raw, where: data, include, order, limit, offset }

  if (transaction) query = { ...query, transaction }
  if (!_.isEmpty(group)) query = { ...query, group }
  if (!_.isEmpty(attributes)) query = { ...query, attributes }

  return model.findAll(query)
}

export const createNewEntity = async ({ model, data = {}, include, transaction }) => {
  let query = { include }

  if (transaction) query = { ...query, transaction }
  const dataValues = await model.create(data, query)

  return dataValues.get({ plain: true })
}

export const updateEntity = async ({ model, values, data, transaction }) => {
  let query = { where: values }
  if (transaction) query = { ...query, transaction }

  const dataValues = await model.update(data, query)

  return dataValues
}

export const deleteEntity = async ({ model, values, transaction }) => {
  let query = { where: values }
  if (transaction) query = { ...query, transaction }

  const deleteEntities = await model.destroy(query)

  return deleteEntities
}

export const updateOrCreateEntity = async ({ transaction, model, values, data }) => {
  const foundItem = await getOne({ model, data: values, transaction })

  if (!foundItem) {
    await createNewEntity({ model, data, transaction })
    return
  }
  await updateEntity({ model, values, data, transaction })
}
