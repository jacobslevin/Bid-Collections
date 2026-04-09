class BidCollectionsCreateDpSpecCacheEntries < ActiveRecord::Migration[5.2]
  def change
    create_table :dp_spec_cache_entries do |t|
      t.references :project, null: false, foreign_key: true, type: :integer
      t.string :project_product_id, null: false
      t.json :payload, null: false
      t.datetime :fetched_at, null: false
      t.datetime :expires_at

      t.timestamps
    end

    add_index :dp_spec_cache_entries, [:project_id, :project_product_id], unique: true, name: 'idx_dp_spec_cache_unique'
    add_index :dp_spec_cache_entries, :expires_at
  end
end

