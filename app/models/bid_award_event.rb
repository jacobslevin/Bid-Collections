class BidAwardEvent < ApplicationRecord
  belongs_to :bid_package
  belongs_to :from_bid, class_name: 'Bid', optional: true
  belongs_to :to_bid, class_name: 'Bid'

  enum :event_type, { award: 0, reaward: 1, unaward: 2 }

  validates :awarded_amount_snapshot, :awarded_by, :awarded_at, presence: true

  before_validation :ensure_comparison_snapshot_shape

  private

  def ensure_comparison_snapshot_shape
    self.comparison_snapshot = {} unless comparison_snapshot.is_a?(Hash)
  end
end
