'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('player_sessions', {
      player_session_id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      player_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'players', key: 'player_id' },
        onDelete: 'CASCADE'
      },
      family_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      token_hash: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      revoked_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      replaced_by_session_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'player_sessions', key: 'player_session_id' }
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    })

    await queryInterface.addIndex('player_sessions', ['family_id'])
    await queryInterface.sequelize.query(
      'CREATE INDEX player_sessions_live_by_player ON player_sessions (player_id) WHERE revoked_at IS NULL'
    )
  },

  async down (queryInterface) {
    await queryInterface.dropTable('player_sessions')
  }
}
