import fs from 'fs'
import path from 'path'
import pg from 'pg'
import Sequelize from 'sequelize'
import * as databaseConfig from '~/configs/database.config'

// Chips live in BIGINT columns, which pg returns as strings. Parse them into
// numbers here, once, for every model and query (COUNT(*) is BIGINT too).
// SUM() of a BIGINT is NUMERIC, so raw queries cast sums back with ::bigint.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => {
  const number = Number(value)
  if (!Number.isSafeInteger(number)) throw new RangeError(`BIGINT ${value} is beyond safe integer range`)
  return number
})

const env = process.env.NODE_ENV || 'development'
const basename = path.basename(__filename)
const config = databaseConfig[env]

const db = {}

let sequelize
if (config.use_env_variable) {
  sequelize = new Sequelize(process.env[config.use_env_variable], config)
} else {
  sequelize = new Sequelize(config.database, config.username, config.password, config)
}

fs
  .readdirSync(__dirname)
  .filter(file => {
    return (file.indexOf('.') !== 0) && (file !== basename) && (file.slice(-3) === '.js')
  })
  .forEach(file => {
    const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes)
    db[model.name] = model
  })

Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db)
  }
})

export {
  sequelize,
  Sequelize
}
export default db
