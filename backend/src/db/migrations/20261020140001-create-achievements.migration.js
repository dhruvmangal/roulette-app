'use strict'

// Achievements a player has earned, each paid once as a ledger reward.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('player_achievements', {
      player_achievement_id: { type: Sequelize.INTEGER, autoIncrement: true, allowNull: false, primaryKey: true },
      player_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'players', key: 'player_id' }, onDelete: 'CASCADE' },
      // Which achievement (the definitions live in code, so adding one needs no migration).
      code: { type: Sequelize.STRING(32), allowNull: false },
      reward: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
      wallet_transaction_id: { type: Sequelize.BIGINT, allowNull: true },
      unlocked_at: { type: Sequelize.DATE, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    })
    await queryInterface.addConstraint('player_achievements', { fields: ['player_id', 'code'], type: 'unique', name: 'player_achievements_once' })
    await queryInterface.sequelize.query(`
      ALTER TABLE wallet_transactions
        DROP CONSTRAINT wallet_transactions_type_check,
        ADD CONSTRAINT wallet_transactions_type_check CHECK (type IN (
          'SIGNUP_BONUS', 'DAILY_BONUS', 'REFILL_BONUS', 'PROMO_BONUS', 'REFERRAL_BONUS', 'ACHIEVEMENT_BONUS', 'BET', 'WIN', 'REFUND', 'ADMIN_ADJUST'
        ));
    `)
  },

  async down (queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE wallet_transactions
        DROP CONSTRAINT wallet_transactions_type_check,
        ADD CONSTRAINT wallet_transactions_type_check CHECK (type IN (
          'SIGNUP_BONUS', 'DAILY_BONUS', 'REFILL_BONUS', 'PROMO_BONUS', 'REFERRAL_BONUS', 'BET', 'WIN', 'REFUND', 'ADMIN_ADJUST'
        ));
    `)
    await queryInterface.dropTable('player_achievements')
  }
}
