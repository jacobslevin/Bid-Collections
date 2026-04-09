class BidCollectionsAddDpFieldsToProjects < ActiveRecord::Migration[5.2]
  def change
    add_column :projects, :firm_id, :bigint unless column_exists?(:projects, :firm_id)
    add_column :projects, :dp_project_id, :string unless column_exists?(:projects, :dp_project_id)

    add_index :projects, :firm_id unless index_exists?(:projects, :firm_id)
    add_index :projects, :dp_project_id, unique: true unless index_exists?(:projects, :dp_project_id)
  end
end

