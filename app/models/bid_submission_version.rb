class BidSubmissionVersion < ApplicationRecord
  belongs_to :bid

  validates :version_number, presence: true, numericality: { greater_than: 0, only_integer: true }
  validates :submitted_at, presence: true
  validates :line_items_snapshot, presence: true
end

