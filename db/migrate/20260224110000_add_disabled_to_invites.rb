class AddDisabledToInvites < ActiveRecord::Migration[7.1]
  def change
    add_column :invites, :disabled, :boolean, null: false, default: false
    add_index :invites, :disabled
  end
end
