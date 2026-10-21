'use strict'

// The ledger. Append-only: a database trigger rejects any UPDATE or DELETE.
module.exports = (sequelize, DataTypes) => {
  const WalletTransaction = sequelize.define('WalletTransaction', {
    walletTransactionId: {
      autoIncrement: true,
      type: DataTypes.BIGINT,
      allowNull: false,
      primaryKey: true
    },
    walletId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    playerId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    type: {
      type: DataTypes.STRING(32),
      allowNull: false
    },
    direction: {
      type: DataTypes.STRING(8),
      allowNull: false
    },
    amount: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    balanceBefore: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    balanceAfter: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    referenceType: {
      type: DataTypes.STRING(16),
      allowNull: true
    },
    referenceId: {
      type: DataTypes.STRING(64),
      allowNull: true
    },
    // Replaying a request with the same key returns the original row.
    idempotencyKey: {
      type: DataTypes.STRING(128),
      allowNull: false
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    }
  }, {
    sequelize,
    tableName: 'wallet_transactions',
    schema: 'public',
    timestamps: true,
    updatedAt: false,
    underscored: true
  })

  WalletTransaction.associate = (models) => {
    WalletTransaction.belongsTo(models.Wallet, { foreignKey: 'walletId' })
  }

  return WalletTransaction
}
