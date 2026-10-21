'use strict'

// Chat gains kinds beyond typed text: quick reactions, and the table's own
// lines (what a player bet, what came of it). Seats get a switch for whether
// those lines about their bets are shared.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('chat_messages', 'kind', { type: Sequelize.STRING(12), allowNull: false, defaultValue: 'TEXT' })
    await queryInterface.addColumn('chat_messages', 'data', { type: Sequelize.JSONB, allowNull: true })
    await queryInterface.addColumn('room_players', 'share_bets', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true })
  },

  async down (queryInterface) {
    await queryInterface.removeColumn('room_players', 'share_bets')
    await queryInterface.removeColumn('chat_messages', 'data')
    await queryInterface.removeColumn('chat_messages', 'kind')
  }
}
