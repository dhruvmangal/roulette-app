'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('player_bonuses', {
      player_bonus_id: {
        type: Sequelize.INTEGER,
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
      bonus_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'bonuses', key: 'bonus_id' }
      },
      claim_number: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      streak_day: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      amount: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      wallet_transaction_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'wallet_transactions', key: 'wallet_transaction_id' }
      },
      claimed_at: {
        type: Sequelize.DATE,
        allowNull: false
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

    await queryInterface.addConstraint('player_bonuses', {
      fields: ['player_id', 'bonus_id', 'claim_number'],
      type: 'unique',
      name: 'player_bonuses_one_claim_per_number'
    })
  },

  async down (queryInterface) {
    await queryInterface.dropTable('player_bonuses')
  }
}
