'use strict'

// A device a player has used: one row per player per install id, with what
// it was last seen as (OS, model, screen, language...).
module.exports = (sequelize, DataTypes) => {
  const PlayerDevice = sequelize.define('PlayerDevice', {
    playerDeviceId: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    playerId: { type: DataTypes.INTEGER, allowNull: false },
    deviceId: { type: DataTypes.STRING(64), allowNull: false },
    platform: { type: DataTypes.STRING(16), allowNull: false },
    deviceType: { type: DataTypes.STRING(16), allowNull: true },
    deviceVendor: { type: DataTypes.STRING(64), allowNull: true },
    deviceModel: { type: DataTypes.STRING(64), allowNull: true },
    isVirtual: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    osName: { type: DataTypes.STRING(32), allowNull: true },
    osVersion: { type: DataTypes.STRING(32), allowNull: true },
    browserName: { type: DataTypes.STRING(32), allowNull: true },
    browserVersion: { type: DataTypes.STRING(32), allowNull: true },
    appVersion: { type: DataTypes.STRING(32), allowNull: true },
    screenWidth: { type: DataTypes.INTEGER, allowNull: true },
    screenHeight: { type: DataTypes.INTEGER, allowNull: true },
    pixelRatio: { type: DataTypes.FLOAT, allowNull: true },
    language: { type: DataTypes.STRING(35), allowNull: true },
    timezone: { type: DataTypes.STRING(64), allowNull: true },
    userAgent: { type: DataTypes.STRING(512), allowNull: true },
    visits: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    firstSeenAt: { type: DataTypes.DATE, allowNull: false },
    lastSeenAt: { type: DataTypes.DATE, allowNull: false }
  }, {
    sequelize,
    tableName: 'player_devices',
    schema: 'public',
    timestamps: true,
    underscored: true
  })

  PlayerDevice.associate = (models) => {
    PlayerDevice.belongsTo(models.Player, { foreignKey: 'playerId' })
    PlayerDevice.hasMany(models.PlayerVisit, { foreignKey: 'playerDeviceId' })
  }

  return PlayerDevice
}
