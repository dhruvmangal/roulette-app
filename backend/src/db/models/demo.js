'use strict'

// Example model — delete once you add your own. Shows the expected shape:
// singular model name, smallcase/underscored columns, `associate` hook.
module.exports = (sequelize, DataTypes) => {
  const Demo = sequelize.define('Demo', {
    demoId: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  }, {
    sequelize,
    tableName: 'demos',
    schema: 'public',
    timestamps: true,
    underscored: true
  })

  // Demo.associate = (models) => {
  //   Demo.belongsTo(models.User, { foreignKey: 'userId' })
  // }

  return Demo
}
