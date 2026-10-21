'use strict'

// One row per change an admin made. Append-only: a database trigger rejects
// any UPDATE or DELETE.
module.exports = (sequelize, DataTypes) => {
  const AdminAuditLog = sequelize.define('AdminAuditLog', {
    adminAuditLogId: {
      autoIncrement: true,
      type: DataTypes.BIGINT,
      allowNull: false,
      primaryKey: true
    },
    adminUserId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    // e.g. WALLET_ADJUST, PLAYER_STATUS, BONUS_UPDATE
    action: {
      type: DataTypes.STRING(48),
      allowNull: false
    },
    // PLAYER, BONUS, ...
    targetType: {
      type: DataTypes.STRING(16),
      allowNull: true
    },
    targetId: {
      type: DataTypes.STRING(64),
      allowNull: true
    },
    details: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    }
  }, {
    sequelize,
    tableName: 'admin_audit_logs',
    schema: 'public',
    timestamps: true,
    updatedAt: false,
    underscored: true
  })

  AdminAuditLog.associate = (models) => {
    AdminAuditLog.belongsTo(models.AdminUser, { foreignKey: 'adminUserId' })
  }

  return AdminAuditLog
}
