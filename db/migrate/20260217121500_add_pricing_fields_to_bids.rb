class AddPricingFieldsToBids < ActiveRecord::Migration[7.1]
  def change
    add_column :bids, :delivery_amount, :decimal, precision: 14, scale: 2
    add_column :bids, :install_amount, :decimal, precision: 14, scale: 2
    add_column :bids, :escalation_amount, :decimal, precision: 14, scale: 2
    add_column :bids, :contingency_amount, :decimal, precision: 14, scale: 2
    add_column :bids, :sales_tax_amount, :decimal, precision: 14, scale: 2
  end
end
