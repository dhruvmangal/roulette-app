'use strict'

module.exports = (sequelize, DataTypes) => {
  const Bet = sequelize.define('Bet', {
    betId: {
      autoIncrement: true,
      type: DataTypes.BIGINT,
      allowNull: false,
      primaryKey: true
    },
    roundId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    roomPlayerId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    // Null for bots.
    playerId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    betType: {
      type: DataTypes.STRING(16),
      allowNull: false
    },
    // The rest of the engine's bet: { pockets } or { index } or {}.
    selection: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    },
    amount: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    // Stake plus winnings once settled; 0 for a loss.
    payout: {
      type: DataTypes.BIGINT,
      allowNull: true
    },
    status: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'PLACED'
    },
    // The client's id for the request that placed it, so retries are safe.
    requestId: {
      type: DataTypes.STRING(64),
      allowNull: true
    },
    debitTransactionId: {
      type: DataTypes.BIGINT,
      allowNull: true
    },
    // The WIN or REFUND ledger row.
    payoutTransactionId: {
      type: DataTypes.BIGINT,
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'bets',
    schema: 'public',
    timestamps: true,
    underscored: true
  })

  Bet.associate = (models) => {
    Bet.belongsTo(models.Round, { foreignKey: 'roundId' })
    Bet.belongsTo(models.RoomPlayer, { foreignKey: 'roomPlayerId' })
  }

  return Bet
}
