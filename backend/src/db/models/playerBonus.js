'use strict'

// One row per claim. UNIQUE(player_id, bonus_id, claim_number) makes a
// double claim impossible even if two requests race.
module.exports = (sequelize, DataTypes) => {
  const PlayerBonus = sequelize.define('PlayerBonus', {
    playerBonusId: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    playerId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    bonusId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    // 1 for the player's first claim of this bonus, 2 for the next, ...
    claimNumber: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    streakDay: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    amount: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    walletTransactionId: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    claimedAt: {
      type: DataTypes.DATE,
      allowNull: false
    }
  }, {
    sequelize,
    tableName: 'player_bonuses',
    schema: 'public',
    timestamps: true,
    underscored: true
  })

  PlayerBonus.associate = (models) => {
    PlayerBonus.belongsTo(models.Player, { foreignKey: 'playerId' })
    PlayerBonus.belongsTo(models.Bonus, { foreignKey: 'bonusId' })
  }

  return PlayerBonus
}
