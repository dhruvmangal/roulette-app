'use strict'

// Push notifications: the phones to notify, what each player wants to hear
// about, and a log that makes "send this once" and rate limits possible.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('push_tokens', {
      push_token_id: { type: Sequelize.INTEGER, autoIncrement: true, allowNull: false, primaryKey: true },
      player_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'players', key: 'player_id' }, onDelete: 'CASCADE' },
      // The FCM registration token (it also carries iOS pushes, through APNs).
      token: { type: Sequelize.STRING(512), allowNull: false, unique: true },
      platform: { type: Sequelize.STRING(8), allowNull: false },
      device_id: { type: Sequelize.STRING(64), allowNull: true },
      app_version: { type: Sequelize.STRING(32), allowNull: true },
      // What the notification says is in the player's language on that phone.
      language: { type: Sequelize.STRING(8), allowNull: false, defaultValue: 'en' },
      last_seen_at: { type: Sequelize.DATE, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    })
    await queryInterface.addIndex('push_tokens', ['player_id'])
    await queryInterface.sequelize.query("ALTER TABLE push_tokens ADD CONSTRAINT push_tokens_platform_check CHECK (platform IN ('android', 'ios'))")

    // { dailyBonus: false, ... }: a category not listed is on.
    await queryInterface.addColumn('players', 'notification_prefs', { type: Sequelize.JSONB, allowNull: false, defaultValue: {} })

    await queryInterface.createTable('notification_log', {
      notification_log_id: { type: Sequelize.BIGINT, autoIncrement: true, allowNull: false, primaryKey: true },
      player_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'players', key: 'player_id' }, onDelete: 'CASCADE' },
      category: { type: Sequelize.STRING(24), allowNull: false },
      // One push per key: e.g. 'daily:51:7' is sent once for that claim.
      dedupe_key: { type: Sequelize.STRING(96), allowNull: true },
      devices: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false }
    })
    await queryInterface.addIndex('notification_log', ['player_id', 'created_at'])
    await queryInterface.sequelize.query('CREATE UNIQUE INDEX notification_log_dedupe ON notification_log (dedupe_key) WHERE dedupe_key IS NOT NULL')
  },

  async down (queryInterface) {
    await queryInterface.dropTable('notification_log')
    await queryInterface.removeColumn('players', 'notification_prefs')
    await queryInterface.dropTable('push_tokens')
  }
}
