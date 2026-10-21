'use strict'

// A push notification that was sent. Its dedupe key stops the same one going out twice.
module.exports = (sequelize, DataTypes) => {
  const NotificationLog = sequelize.define('NotificationLog', {
    notificationLogId: { autoIncrement: true, type: DataTypes.BIGINT, allowNull: false, primaryKey: true },
    playerId: { type: DataTypes.INTEGER, allowNull: false },
    category: { type: DataTypes.STRING(24), allowNull: false },
    dedupeKey: { type: DataTypes.STRING(96), allowNull: true },
    devices: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
  }, {
    sequelize,
    tableName: 'notification_log',
    schema: 'public',
    timestamps: true,
    updatedAt: false,
    underscored: true
  })

  return NotificationLog
}
