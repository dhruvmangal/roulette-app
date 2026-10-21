'use strict'

// One row per refresh token. Refreshing retires the row and adds its
// successor in the same family (one login's chain of tokens). The token
// itself is never stored, only a SHA-256 of its random id.
module.exports = (sequelize, DataTypes) => {
  const PlayerSession = sequelize.define('PlayerSession', {
    playerSessionId: {
      autoIncrement: true,
      type: DataTypes.BIGINT,
      allowNull: false,
      primaryKey: true
    },
    playerId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    // Shared by every token descended from one login.
    familyId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    tokenHash: {
      type: DataTypes.STRING(64),
      allowNull: false
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    // Set when the token is used (rotated), logged out, or found stolen.
    revokedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    replacedBySessionId: {
      type: DataTypes.BIGINT,
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'player_sessions',
    schema: 'public',
    timestamps: true,
    underscored: true
  })

  PlayerSession.associate = (models) => {
    PlayerSession.belongsTo(models.Player, { foreignKey: 'playerId' })
  }

  return PlayerSession
}
