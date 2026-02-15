class BidLineItem < ApplicationRecord
  belongs_to :bid
  belongs_to :spec_item

  validates :unit_price, numericality: { greater_than_or_equal_to: 0 }, allow_nil: true
  validates :lead_time_days, numericality: { greater_than_or_equal_to: 0, only_integer: true }, allow_nil: true
  validates :spec_item_id, uniqueness: { scope: :bid_id }
end
