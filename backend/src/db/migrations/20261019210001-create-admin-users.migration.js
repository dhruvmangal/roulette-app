'use strict'

// Staff accounts for the admin app, and an append-only log of what they did.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('admin_users', {
      admin_user_id: { type: Sequelize.INTEGER, autoIncrement: true, allowNull: false, primaryKey: true },
      email: { type: Sequelize.STRING(254), allowNull: false },
      name: { type: Sequelize.STRING(64), allowNull: false },
      // scrypt: "<salt hex>:<key hex>"
      password_hash: { type: Sequelize.STRING(255), allowNull: false },
      status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'active' },
      token_version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      last_login_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    })
    await queryInterface.sequelize.query('CREATE UNIQUE INDEX admin_users_email_lower ON admin_users (lower(email))')

    await queryInterface.createTable('admin_audit_logs', {
      admin_audit_log_id: { type: Sequelize.BIGINT, autoIncrement: true, allowNull: false, primaryKey: true },
      admin_user_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'admin_users', key: 'admin_user_id' } },
      action: { type: Sequelize.STRING(48), allowNull: false },
      target_type: { type: Sequelize.STRING(16), allowNull: true },
      target_id: { type: Sequelize.STRING(64), allowNull: true },
      details: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false }
    })
    await queryInterface.addIndex('admin_audit_logs', ['target_type', 'target_id'])

    // Like the wallet ledger, the audit log is never rewritten.
    await queryInterface.sequelize.query(`
      CREATE FUNCTION admin_audit_logs_append_only() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'admin_audit_logs is append-only';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER admin_audit_logs_append_only BEFORE UPDATE OR DELETE ON admin_audit_logs
        FOR EACH ROW EXECUTE FUNCTION admin_audit_logs_append_only();
    `)
  },

  async down (queryInterface) {
    await queryInterface.dropTable('admin_audit_logs')
    await queryInterface.sequelize.query('DROP FUNCTION IF EXISTS admin_audit_logs_append_only()')
    await queryInterface.dropTable('admin_users')
  }
}
