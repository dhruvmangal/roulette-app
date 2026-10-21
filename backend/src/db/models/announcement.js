'use strict'

// A push notification sent by an admin, and how it went.
module.exports = (sequelize, DataTypes) => {
  const Announcement = sequelize.define('Announcement', {
    announcementId: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    adminUserId: { type: DataTypes.INTEGER, allowNull: false },
    requestId: { type: DataTypes.STRING(64), allowNull: false },
    title: { type: DataTypes.STRING(80), allowNull: false },
    body: { type: DataTypes.STRING(240), allowNull: false },
    audience: { type: DataTypes.STRING(16), allowNull: false },
    audienceDays: { type: DataTypes.INTEGER, allowNull: true },
    audiencePlayerId: { type: DataTypes.INTEGER, allowNull: true },
    status: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'SENDING' },
    targeted: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    sent: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    skipped: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    error: { type: DataTypes.TEXT, allowNull: true },
    finishedAt: { type: DataTypes.DATE, allowNull: true }
  }, {
    sequelize,
    tableName: 'announcements',
    schema: 'public',
    timestamps: true,
    underscored: true
  })

  Announcement.associate = (models) => {
    Announcement.belongsTo(models.AdminUser, { as: 'admin', foreignKey: 'adminUserId' })
  }

  return Announcement
}
