import {
  AutoIncrement,
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

@Table({
  tableName: 'items',
  timestamps: true,
  underscored: true,
})
export class ItemModel extends Model<ItemModel> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @Column({ type: DataType.STRING, allowNull: false })
  name!: string;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  quantity!: number;

  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'ACTIVE' })
  status!: string;
}
