'use strict'

module.exports = (sequelize, DataTypes) => {
  const Round = sequelize.define('Round', {
    roundId: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    roomId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    roundNumber: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    status: {
      type: DataTypes.STRING(16),
      allowNull: false
    },
    // Set when the wheel is spun.
    winningPocket: {
      type: DataTypes.STRING(2),
      allowNull: true
    },
    // When the current phase ends. Stored so a restarted server resumes the
    // round on time instead of losing it.
    phaseEndsAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    resultAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    // Reserved for provably-fair spins (commit sha256(seed) before betting).
    seedHash: {
      type: DataTypes.STRING(64),
      allowNull: true
    },
    seed: {
      type: DataTypes.STRING(64),
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'rounds',
    schema: 'public',
    timestamps: true,
    underscored: true
  })

  Round.associate = (models) => {
    Round.belongsTo(models.Room, { foreignKey: 'roomId' })
    Round.hasMany(models.Bet, { foreignKey: 'roundId' })
  }

  return Round
}
