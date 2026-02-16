class CreateBidSubmissionVersions < ActiveRecord::Migration[7.1]
  def change
    create_table :bid_submission_versions do |t|
      t.references :bid, null: false, foreign_key: true
      t.integer :version_number, null: false
      t.datetime :submitted_at, null: false
      t.decimal :total_amount, precision: 14, scale: 2
      t.jsonb :line_items_snapshot, null: false, default: []

      t.timestamps
    end

    add_index :bid_submission_versions, [:bid_id, :version_number], unique: true
    add_index :bid_submission_versions, [:bid_id, :submitted_at]
  end
end

