class BidCollectionsCreateDpSyncRequests < ActiveRecord::Migration[5.2]
  def change
    create_table :dp_sync_requests do |t|
      t.string :sync_id, null: false
      t.integer :status, null: false, default: 0

      t.references :project, null: false, foreign_key: true, type: :integer
      t.references :bid_package, null: false, foreign_key: true

      t.string :idempotency_key, null: false
      t.string :requested_by

      t.json :received_ids, null: false
      t.integer :resolved_count, null: false, default: 0
      t.integer :missing_count, null: false, default: 0
      t.json :missing_ids
      t.json :errors_json

      t.datetime :started_at
      t.datetime :finished_at

      t.timestamps
    end

    add_index :dp_sync_requests, :sync_id, unique: true
    add_index :dp_sync_requests, :idempotency_key, unique: true
  end
end

