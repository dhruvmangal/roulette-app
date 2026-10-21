'use strict'

module.exports = (sequelize, DataTypes) => {
  const Room = sequelize.define('Room', {
    roomId: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    // Six characters to share for joining; unique.
    code: {
      type: DataTypes.STRING(6),
      allowNull: false
    },
    variant: {
      type: DataTypes.STRING(16),
      allowNull: false
    },
    mode: {
      type: DataTypes.STRING(16),
      allowNull: false
    },
    maxSeats: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 8
    },
    // Null plays on until everyone leaves.
    totalRounds: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    // Smallest single bet.
    minBet: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    // Most one player may stake in a round.
    maxBet: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    bettingSeconds: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    status: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'OPEN'
    },
    // Null for public rooms the server opened.
    hostPlayerId: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'rooms',
    schema: 'public',
    timestamps: true,
    underscored: true
  })

  Room.associate = (models) => {
    Room.hasMany(models.RoomPlayer, { foreignKey: 'roomId' })
    Room.hasMany(models.Round, { foreignKey: 'roomId' })
  }

  return Room
}
