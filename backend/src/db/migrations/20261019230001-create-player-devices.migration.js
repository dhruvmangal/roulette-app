'use strict'

// Where and on what players play: one row per player per device (the app's
// install id), and one row per visit (sign-in or app start), kept 90 days.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('player_devices', {
      player_device_id: { type: Sequelize.INTEGER, autoIncrement: true, allowNull: false, primaryKey: true },
      player_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'players', key: 'player_id' }, onDelete: 'CASCADE' },
      // Random id the app makes once per install (browser storage or app data).
      device_id: { type: Sequelize.STRING(64), allowNull: false },
      platform: { type: Sequelize.STRING(16), allowNull: false },
      device_type: { type: Sequelize.STRING(16), allowNull: true },
      device_vendor: { type: Sequelize.STRING(64), allowNull: true },
      device_model: { type: Sequelize.STRING(64), allowNull: true },
      is_virtual: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      os_name: { type: Sequelize.STRING(32), allowNull: true },
      os_version: { type: Sequelize.STRING(32), allowNull: true },
      browser_name: { type: Sequelize.STRING(32), allowNull: true },
      browser_version: { type: Sequelize.STRING(32), allowNull: true },
      app_version: { type: Sequelize.STRING(32), allowNull: true },
      screen_width: { type: Sequelize.INTEGER, allowNull: true },
      screen_height: { type: Sequelize.INTEGER, allowNull: true },
      pixel_ratio: { type: Sequelize.FLOAT, allowNull: true },
      language: { type: Sequelize.STRING(35), allowNull: true },
      timezone: { type: Sequelize.STRING(64), allowNull: true },
      user_agent: { type: Sequelize.STRING(512), allowNull: true },
      visits: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      first_seen_at: { type: Sequelize.DATE, allowNull: false },
      last_seen_at: { type: Sequelize.DATE, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    })
    await queryInterface.addConstraint('player_devices', { fields: ['player_id', 'device_id'], type: 'unique', name: 'player_devices_once_per_player' })
    await queryInterface.addIndex('player_devices', ['device_id'])

    await queryInterface.createTable('player_visits', {
      player_visit_id: { type: Sequelize.BIGINT, autoIncrement: true, allowNull: false, primaryKey: true },
      player_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'players', key: 'player_id' }, onDelete: 'CASCADE' },
      player_device_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'player_devices', key: 'player_device_id' }, onDelete: 'CASCADE' },
      ip: { type: Sequelize.STRING(45), allowNull: true },
      country: { type: Sequelize.STRING(2), allowNull: true },
      region: { type: Sequelize.STRING(64), allowNull: true },
      city: { type: Sequelize.STRING(64), allowNull: true },
      // Rounded to ~1 km: an IP's location is only approximate anyway.
      latitude: { type: Sequelize.DECIMAL(6, 2), allowNull: true },
      longitude: { type: Sequelize.DECIMAL(6, 2), allowNull: true },
      network_type: { type: Sequelize.STRING(16), allowNull: true },
      network_quality: { type: Sequelize.STRING(16), allowNull: true },
      orientation: { type: Sequelize.STRING(32), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false }
    })
    await queryInterface.addIndex('player_visits', ['player_id', 'created_at'])
    await queryInterface.addIndex('player_visits', ['ip', 'created_at'])
  },

  async down (queryInterface) {
    await queryInterface.dropTable('player_visits')
    await queryInterface.dropTable('player_devices')
  }
}
