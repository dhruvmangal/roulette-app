'use strict'

// A seat at a table. Rows stay after the player leaves (left_at is set), so
// only seats with left_at NULL are taken.
module.exports = (sequelize, DataTypes) => {
  const RoomPlayer = sequelize.define('RoomPlayer', {
    roomPlayerId: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    roomId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    // Null for bots.
    playerId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    seat: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    isBot: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    // Bots only: { name, style, balance }. Bot chips are play money that never
    // touches the wallet ledger.
    botProfile: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    joinedAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    leftAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    // Set when the player's last socket leaves the table; cleared when they return.
    awaySince: {
      type: DataTypes.DATE,
      allowNull: true
    },
    // Whether the table's chat lines may say what this player bet and won.
    shareBets: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  }, {
    sequelize,
    tableName: 'room_players',
    schema: 'public',
    timestamps: true,
    underscored: true
  })

  RoomPlayer.associate = (models) => {
    RoomPlayer.belongsTo(models.Room, { foreignKey: 'roomId' })
    RoomPlayer.belongsTo(models.Player, { foreignKey: 'playerId' })
    RoomPlayer.hasMany(models.Bet, { foreignKey: 'roomPlayerId' })
  }

  return RoomPlayer
}
