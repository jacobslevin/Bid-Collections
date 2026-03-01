class AddComparisonSnapshotToBidAwardEvents < ActiveRecord::Migration[7.1]
  def change
    add_column :bid_award_events, :comparison_snapshot, :json
  end
end
