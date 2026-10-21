'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('bonuses', {
      bonus_id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      code: {
        type: Sequelize.STRING(32),
        allowNull: false,
        unique: true
      },
      type: {
        type: Sequelize.STRING(16),
        allowNull: false
      },
      amount: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      cooldown_seconds: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      max_claims: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      min_balance_threshold: {
        type: Sequelize.BIGINT,
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
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
      ALTER TABLE bonuses
        ADD CONSTRAINT bonuses_type_check CHECK (type IN ('SIGNUP', 'DAILY', 'REFILL', 'PROMO')),
        ADD CONSTRAINT bonuses_amount_positive CHECK (amount > 0);
    `)

    // The game needs these in every environment, so they ship with the
    // schema rather than as dev seed data. Edit the rows to retune them.
    const now = new Date()
    await queryInterface.bulkInsert('bonuses', [
      { code: 'SIGNUP', type: 'SIGNUP', amount: 1000, cooldown_seconds: null, max_claims: 1, min_balance_threshold: null, is_active: true, created_at: now, updated_at: now },
      { code: 'DAILY', type: 'DAILY', amount: 100, cooldown_seconds: 24 * 60 * 60, max_claims: null, min_balance_threshold: null, is_active: true, created_at: now, updated_at: now },
      { code: 'REFILL', type: 'REFILL', amount: 500, cooldown_seconds: 4 * 60 * 60, max_claims: null, min_balance_threshold: 50, is_active: true, created_at: now, updated_at: now }
    ])
  },

  async down (queryInterface) {
    await queryInterface.dropTable('bonuses')
  }
}
