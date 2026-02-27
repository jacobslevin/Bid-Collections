class AddActiveToSpecItems < ActiveRecord::Migration[7.1]
  def change
    add_column :spec_items, :active, :boolean, null: false, default: true
    add_index :spec_items, [:bid_package_id, :active]
  end
end
