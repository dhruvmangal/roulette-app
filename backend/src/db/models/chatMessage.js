'use strict'

// A message in an online table's chat, already cleaned and filtered.
module.exports = (sequelize, DataTypes) => {
  const ChatMessage = sequelize.define('ChatMessage', {
    chatMessageId: {
      autoIncrement: true,
      type: DataTypes.BIGINT,
      allowNull: false,
      primaryKey: true
    },
    roomId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    roomPlayerId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    playerId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    text: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    // TEXT, REACTION (text is the reaction id), BETS or RESULT (data holds the details).
    kind: {
      type: DataTypes.STRING(12),
      allowNull: false,
      defaultValue: 'TEXT'
    },
    data: {
      type: DataTypes.JSONB,
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'chat_messages',
    schema: 'public',
    timestamps: true,
    updatedAt: false,
    underscored: true
  })

  ChatMessage.associate = (models) => {
    ChatMessage.belongsTo(models.RoomPlayer, { foreignKey: 'roomPlayerId' })
    ChatMessage.belongsTo(models.Player, { foreignKey: 'playerId' })
  }

  return ChatMessage
}
