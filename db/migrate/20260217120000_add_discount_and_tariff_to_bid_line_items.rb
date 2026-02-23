class AddDiscountAndTariffToBidLineItems < ActiveRecord::Migration[7.1]
  def change
    add_column :bid_line_items, :discount_percent, :decimal, precision: 6, scale: 3
    add_column :bid_line_items, :tariff_percent, :decimal, precision: 6, scale: 3
  end
end
