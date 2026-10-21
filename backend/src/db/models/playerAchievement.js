'use strict'

// An achievement a player has earned. At most one row per player and achievement.
module.exports = (sequelize, DataTypes) => {
  const PlayerAchievement = sequelize.define('PlayerAchievement', {
    playerAchievementId: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    playerId: { type: DataTypes.INTEGER, allowNull: false },
    code: { type: DataTypes.STRING(32), allowNull: false },
    reward: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    walletTransactionId: { type: DataTypes.BIGINT, allowNull: true },
    unlockedAt: { type: DataTypes.DATE, allowNull: false }
  }, {
    sequelize,
    tableName: 'player_achievements',
    schema: 'public',
    timestamps: true,
    underscored: true
  })

  PlayerAchievement.associate = (models) => {
    PlayerAchievement.belongsTo(models.Player, { foreignKey: 'playerId' })
  }

  return PlayerAchievement
}
