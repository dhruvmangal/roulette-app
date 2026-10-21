'use strict'

module.exports = (sequelize, DataTypes) => {
  const Player = sequelize.define('Player', {
    playerId: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    // Unique regardless of case (a lower(username) index in the migration).
    username: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    // True until the player links a Google or Apple account; a guest's only
    // way back in is their refresh token.
    isGuest: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    status: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'active',
      validate: { isIn: [['active', 'banned', 'inactive']] }
    },
    avatar: {
      type: DataTypes.STRING,
      allowNull: true
    },
    country: {
      type: DataTypes.STRING(2),
      allowNull: true
    },
    // Bumped to revoke every token issued so far (logout everywhere, bans).
    tokenVersion: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    // Which kinds of push a player wants, e.g. { friends: false }. A kind not listed is on.
    notificationPrefs: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    },
    // The code friends join with (Refer & earn); made on first use.
    referralCode: {
      type: DataTypes.STRING(12),
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'players',
    schema: 'public',
    timestamps: true,
    underscored: true
  })

  Player.associate = (models) => {
    Player.hasOne(models.Wallet, { foreignKey: 'playerId' })
    Player.hasMany(models.PlayerBonus, { foreignKey: 'playerId' })
    Player.hasMany(models.PlayerIdentity, { foreignKey: 'playerId' })
  }

  return Player
}
