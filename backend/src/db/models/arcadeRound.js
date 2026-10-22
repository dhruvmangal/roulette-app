'use strict'

// One play of an arcade game: what was staked, what came up and what was paid.
module.exports = (sequelize, DataTypes) => {
  const ArcadeRound = sequelize.define('ArcadeRound', {
    arcadeRoundId: { autoIncrement: true, type: DataTypes.BIGINT, allowNull: false, primaryKey: true },
    playerId: { type: DataTypes.INTEGER, allowNull: false },
    game: { type: DataTypes.STRING(16), allowNull: false },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'SETTLED' },
    stake: { type: DataTypes.BIGINT, allowNull: false },
    payout: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    outcome: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    requestId: { type: DataTypes.STRING(64), allowNull: false },
    startedAt: { type: DataTypes.DATE, allowNull: false },
    settledAt: { type: DataTypes.DATE, allowNull: true }
  }, {
    sequelize,
    tableName: 'arcade_rounds',
    schema: 'public',
    timestamps: true,
    underscored: true
  })

  ArcadeRound.associate = (models) => {
    ArcadeRound.belongsTo(models.Player, { as: 'player', foreignKey: 'playerId' })
  }

  return ArcadeRound
}
