class BidCollectionsCreateProjects < ActiveRecord::Migration[5.2]
  def change
    return if table_exists?(:projects)

    # Integer PK matches legacy host apps (Rails pre-5.1) so FKs from bid_packages.project_id work.
    create_table :projects, id: :integer do |t|
      t.string :name, null: false
      t.text :description

      t.timestamps
    end
  end
end
