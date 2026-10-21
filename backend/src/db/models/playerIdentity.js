'use strict'

// A Google or Apple account that signs in as a player. One player can link
// both; each provider account belongs to exactly one player.
module.exports = (sequelize, DataTypes) => {
  const PlayerIdentity = sequelize.define('PlayerIdentity', {
    playerIdentityId: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    playerId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    provider: {
      type: DataTypes.STRING(16),
      allowNull: false
    },
    // The provider's stable user id (the token's `sub`), never an email.
    subject: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    // Provider-verified only; Apple may give a private relay address.
    email: {
      type: DataTypes.STRING(254),
      allowNull: true
    },
    lastUsedAt: {
      type: DataTypes.DATE,
      allowNull: false
    }
  }, {
    sequelize,
    tableName: 'player_identities',
    schema: 'public',
    timestamps: true,
    underscored: true
  })

  PlayerIdentity.associate = (models) => {
    PlayerIdentity.belongsTo(models.Player, { foreignKey: 'playerId' })
  }

  return PlayerIdentity
}
