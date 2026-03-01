class SpecItemRequirementApproval < ApplicationRecord
  belongs_to :bid_package
  belongs_to :spec_item
  belongs_to :bid, optional: true

  validates :requirement_key, :approved_at, presence: true
  validates :requirement_key, uniqueness: { scope: [:spec_item_id, :bid_id] }
end
