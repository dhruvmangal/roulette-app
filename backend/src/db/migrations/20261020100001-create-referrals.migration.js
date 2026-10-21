'use strict'

// Refer and earn: every player can share a code; a friend who joins with it
// is linked here, and both are paid once the friend qualifies.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Made the first time the player opens Refer & earn.
    await queryInterface.addColumn('players', 'referral_code', { type: Sequelize.STRING(12), allowNull: true })
    await queryInterface.addConstraint('players', { fields: ['referral_code'], type: 'unique', name: 'players_referral_code_unique' })

    await queryInterface.createTable('referrals', {
      referral_id: { type: Sequelize.INTEGER, autoIncrement: true, allowNull: false, primaryKey: true },
      referrer_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'players', key: 'player_id' }, onDelete: 'CASCADE' },
      // A player can be referred once.
      referee_id: { type: Sequelize.INTEGER, allowNull: false, unique: true, references: { model: 'players', key: 'player_id' }, onDelete: 'CASCADE' },
      code: { type: Sequelize.STRING(12), allowNull: false },
      status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'PENDING' },
      reject_reason: { type: Sequelize.STRING(32), allowNull: true },
      referrer_reward: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
      referee_reward: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
      rewarded_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    })
    await queryInterface.addIndex('referrals', ['referrer_id', 'status'])
    await queryInterface.sequelize.query(`
      ALTER TABLE referrals
        ADD CONSTRAINT referrals_status_check CHECK (status IN ('PENDING', 'REWARDED', 'REJECTED')),
        ADD CONSTRAINT referrals_not_self CHECK (referrer_id <> referee_id);
      ALTER TABLE wallet_transactions
        DROP CONSTRAINT wallet_transactions_type_check,
        ADD CONSTRAINT wallet_transactions_type_check CHECK (type IN (
          'SIGNUP_BONUS', 'DAILY_BONUS', 'REFILL_BONUS', 'PROMO_BONUS', 'REFERRAL_BONUS', 'BET', 'WIN', 'REFUND', 'ADMIN_ADJUST'
        ));
    `)
  },

  async down (queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE wallet_transactions
        DROP CONSTRAINT wallet_transactions_type_check,
        ADD CONSTRAINT wallet_transactions_type_check CHECK (type IN (
          'SIGNUP_BONUS', 'DAILY_BONUS', 'REFILL_BONUS', 'PROMO_BONUS', 'BET', 'WIN', 'REFUND', 'ADMIN_ADJUST'
        ));
    `)
    await queryInterface.dropTable('referrals')
    await queryInterface.removeConstraint('players', 'players_referral_code_unique')
    await queryInterface.removeColumn('players', 'referral_code')
  }
}
