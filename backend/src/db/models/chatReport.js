'use strict'

// A player reporting a chat message, for review. One report per message per player.
module.exports = (sequelize, DataTypes) => {
  const ChatReport = sequelize.define('ChatReport', {
    chatReportId: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    chatMessageId: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    reporterPlayerId: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    tableName: 'chat_reports',
    schema: 'public',
    timestamps: true,
    updatedAt: false,
    underscored: true
  })

  ChatReport.associate = (models) => {
    ChatReport.belongsTo(models.ChatMessage, { foreignKey: 'chatMessageId' })
  }

  return ChatReport
}
