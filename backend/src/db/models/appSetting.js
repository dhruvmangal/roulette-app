'use strict'

// One admin-editable setting, e.g. key 'ads' with value { web: true, app: false }.
module.exports = (sequelize, DataTypes) => {
  const AppSetting = sequelize.define('AppSetting', {
    key: { type: DataTypes.STRING(48), allowNull: false, primaryKey: true },
    value: { type: DataTypes.JSONB, allowNull: false }
  }, {
    sequelize,
    tableName: 'app_settings',
    schema: 'public',
    timestamps: true,
    underscored: true
  })

  return AppSetting
}
