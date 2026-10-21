'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('wallets', {
      wallet_id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      player_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: { model: 'players', key: 'player_id' },
        onDelete: 'CASCADE'
      },
      balance: {
        type: Sequelize.BIGINT,
        allowNull: false,
        defaultValue: 0
      },
      locked_balance: {
        type: Sequelize.BIGINT,
        allowNull: false,
        defaultValue: 0
      },
      currency: {
        type: Sequelize.STRING(8),
        allowNull: false,
        defaultValue: 'CHIP'
      },
      version: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
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

    await queryInterface.sequelize.query(`
      ALTER TABLE wallets ADD CONSTRAINT wallets_balance_non_negative CHECK (balance >= 0);
      ALTER TABLE wallets ADD CONSTRAINT wallets_locked_balance_non_negative CHECK (locked_balance >= 0);
    `)
  },

  async down (queryInterface) {
    await queryInterface.dropTable('wallets')
  }
}
