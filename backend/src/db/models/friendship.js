'use strict'

// A friend request and, once accepted, a friendship. One row per pair of players.
module.exports = (sequelize, DataTypes) => {
  const Friendship = sequelize.define('Friendship', {
    friendshipId: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    requesterId: { type: DataTypes.INTEGER, allowNull: false },
    addresseeId: { type: DataTypes.INTEGER, allowNull: false },
    // DECLINED stays on record, so a declined request can't be sent again and again.
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'PENDING' },
    respondedAt: { type: DataTypes.DATE, allowNull: true }
  }, {
    sequelize,
    tableName: 'friendships',
    schema: 'public',
    timestamps: true,
    underscored: true
  })

  Friendship.associate = (models) => {
    Friendship.belongsTo(models.Player, { as: 'requester', foreignKey: 'requesterId' })
    Friendship.belongsTo(models.Player, { as: 'addressee', foreignKey: 'addresseeId' })
  }

  return Friendship
}
