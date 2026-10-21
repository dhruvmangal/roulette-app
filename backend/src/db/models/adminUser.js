'use strict'

// A staff account for the admin app. Unrelated to players: admins sign in
// with email and password and get a token signed with a separate secret.
module.exports = (sequelize, DataTypes) => {
  const AdminUser = sequelize.define('AdminUser', {
    adminUserId: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    // Unique regardless of case (a lower(email) index in the migration).
    email: {
      type: DataTypes.STRING(254),
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(64),
      allowNull: false
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    status: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'active',
      validate: { isIn: [['active', 'disabled']] }
    },
    // Bumped on logout to revoke every admin token issued so far.
    tokenVersion: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'admin_users',
    schema: 'public',
    timestamps: true,
    underscored: true
  })

  AdminUser.associate = (models) => {
    AdminUser.hasMany(models.AdminAuditLog, { foreignKey: 'adminUserId' })
  }

  return AdminUser
}
