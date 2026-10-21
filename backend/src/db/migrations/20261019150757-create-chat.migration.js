'use strict'

// Table chat on online rooms, and players' reports of messages for moderation.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('chat_messages', {
      chat_message_id: { type: Sequelize.BIGINT, autoIncrement: true, allowNull: false, primaryKey: true },
      room_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'rooms', key: 'room_id' }, onDelete: 'CASCADE' },
      room_player_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'room_players', key: 'room_player_id' } },
      player_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'players', key: 'player_id' } },
      text: { type: Sequelize.STRING(200), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false }
    })
    await queryInterface.addIndex('chat_messages', ['room_id', 'chat_message_id'])

    await queryInterface.createTable('chat_reports', {
      chat_report_id: { type: Sequelize.INTEGER, autoIncrement: true, allowNull: false, primaryKey: true },
      chat_message_id: { type: Sequelize.BIGINT, allowNull: false, references: { model: 'chat_messages', key: 'chat_message_id' }, onDelete: 'CASCADE' },
      reporter_player_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'players', key: 'player_id' } },
      created_at: { type: Sequelize.DATE, allowNull: false }
    })
    await queryInterface.addConstraint('chat_reports', {
      fields: ['chat_message_id', 'reporter_player_id'],
      type: 'unique',
      name: 'chat_reports_once_per_reporter'
    })
  },

  async down (queryInterface) {
    await queryInterface.dropTable('chat_reports')
    await queryInterface.dropTable('chat_messages')
  }
}
