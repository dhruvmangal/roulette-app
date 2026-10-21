'use strict'

// A phone that can be sent push notifications for a player.
module.exports = (sequelize, DataTypes) => {
  const PushToken = sequelize.define('PushToken', {
    pushTokenId: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    playerId: { type: DataTypes.INTEGER, allowNull: false },
    token: { type: DataTypes.STRING(512), allowNull: false },
    platform: { type: DataTypes.STRING(8), allowNull: false },
    deviceId: { type: DataTypes.STRING(64), allowNull: true },
    appVersion: { type: DataTypes.STRING(32), allowNull: true },
    language: { type: DataTypes.STRING(8), allowNull: false, defaultValue: 'en' },
    lastSeenAt: { type: DataTypes.DATE, allowNull: false }
  }, {
    sequelize,
    tableName: 'push_tokens',
    schema: 'public',
    timestamps: true,
    underscored: true
  })

  PushToken.associate = (models) => {
    PushToken.belongsTo(models.Player, { foreignKey: 'playerId' })
  }

  return PushToken
}
