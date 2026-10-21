import config from './app.config'

const commonSetting = {
  database: config.get('db.name'),
  replication: {
    read: {
      username: config.get('db.username'),
      password: config.get('db.password'),
      host: config.get('db.readHost'),
      port: config.get('db.port')
    },
    write: {
      username: config.get('db.username'),
      password: config.get('db.password'),
      host: config.get('db.writeHost'),
      port: config.get('db.port')
    }
  },
  dialect: 'postgres',
  dialectOptions: {
    application_name: config.get('app.name')
  },
  define: {
    underscored: true,
    timestamps: true
  },
  logging: config.get('env') === 'development',
  benchmark: true,
  pool: {
    max: 50,
    min: 5,
    idle: 5000,
    evict: 5000,
    acquire: 60000
  }
}

export const development = {
  ...commonSetting
}

export const test = {
  ...commonSetting
}

export const staging = {
  ...commonSetting
}

export const production = {
  ...commonSetting
}
