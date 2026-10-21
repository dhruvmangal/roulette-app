'use strict'

// A sign-in or app start: from where (IP and its approximate place) and on
// what kind of network. Rows older than VISIT_RETENTION_DAYS are deleted.
module.exports = (sequelize, DataTypes) => {
  const PlayerVisit = sequelize.define('PlayerVisit', {
    playerVisitId: { autoIncrement: true, type: DataTypes.BIGINT, allowNull: false, primaryKey: true },
    playerId: { type: DataTypes.INTEGER, allowNull: false },
    playerDeviceId: { type: DataTypes.INTEGER, allowNull: false },
    ip: { type: DataTypes.STRING(45), allowNull: true },
    country: { type: DataTypes.STRING(2), allowNull: true },
    region: { type: DataTypes.STRING(64), allowNull: true },
    city: { type: DataTypes.STRING(64), allowNull: true },
    latitude: { type: DataTypes.DECIMAL(6, 2), allowNull: true },
    longitude: { type: DataTypes.DECIMAL(6, 2), allowNull: true },
    networkType: { type: DataTypes.STRING(16), allowNull: true },
    networkQuality: { type: DataTypes.STRING(16), allowNull: true },
    orientation: { type: DataTypes.STRING(32), allowNull: true }
  }, {
    sequelize,
    tableName: 'player_visits',
    schema: 'public',
    timestamps: true,
    updatedAt: false,
    underscored: true
  })

  PlayerVisit.associate = (models) => {
    PlayerVisit.belongsTo(models.PlayerDevice, { foreignKey: 'playerDeviceId' })
  }

  return PlayerVisit
}
