class ChangeLeadTimeDaysToString < ActiveRecord::Migration[7.1]
  def change
    change_column :bid_line_items, :lead_time_days, :string
  end
end
