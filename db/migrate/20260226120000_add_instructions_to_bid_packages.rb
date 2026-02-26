class AddInstructionsToBidPackages < ActiveRecord::Migration[7.1]
  def change
    add_column :bid_packages, :instructions, :text
  end
end
