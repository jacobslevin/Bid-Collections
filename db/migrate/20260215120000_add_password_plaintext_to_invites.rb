class AddPasswordPlaintextToInvites < ActiveRecord::Migration[7.1]
  def change
    add_column :invites, :password_plaintext, :string
  end
end

