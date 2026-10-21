'use strict'

// An invite or referral link someone tapped before installing the app.
module.exports = (sequelize, DataTypes) => {
  const DeferredLink = sequelize.define('DeferredLink', {
    deferredLinkId: { autoIncrement: true, type: DataTypes.BIGINT, allowNull: false, primaryKey: true },
    ip: { type: DataTypes.STRING(45), allowNull: false },
    platform: { type: DataTypes.STRING(8), allowNull: false },
    // 'join' (a table code) or 'ref' (a referral code).
    kind: { type: DataTypes.STRING(8), allowNull: false },
    code: { type: DataTypes.STRING(12), allowNull: false },
    consumedAt: { type: DataTypes.DATE, allowNull: true }
  }, {
    sequelize,
    tableName: 'deferred_links',
    schema: 'public',
    timestamps: true,
    underscored: true
  })

  return DeferredLink
}
