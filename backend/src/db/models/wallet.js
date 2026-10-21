'use strict'

// Chips are whole numbers in BIGINT columns; models/index.js parses BIGINT
// into a JS number once, for every model.
module.exports = (sequelize, DataTypes) => {
  const Wallet = sequelize.define('Wallet', {
    walletId: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    playerId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    // Only ApplyWalletTransactionService may change this.
    balance: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0
    },
    lockedBalance: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0
    },
    currency: {
      type: DataTypes.STRING(8),
      allowNull: false,
      defaultValue: 'CHIP'
    },
    // Incremented on every balance change.
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    }
  }, {
    sequelize,
    tableName: 'wallets',
    schema: 'public',
    timestamps: true,
    underscored: true
  })

  Wallet.associate = (models) => {
    Wallet.belongsTo(models.Player, { foreignKey: 'playerId' })
    Wallet.hasMany(models.WalletTransaction, { foreignKey: 'walletId' })
  }

  return Wallet
}
