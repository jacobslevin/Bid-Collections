class BidLineItem < ApplicationRecord
  belongs_to :bid
  belongs_to :spec_item

  validates :unit_price, numericality: { greater_than_or_equal_to: 0 }, allow_nil: true
  validates :discount_percent, numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 100 }, allow_nil: true
  validates :tariff_percent, numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 100 }, allow_nil: true
  validates :lead_time_days, numericality: { greater_than_or_equal_to: 0, only_integer: true }, allow_nil: true
  validates :spec_item_id, uniqueness: { scope: :bid_id }

  def unit_net_price
    return nil if unit_price.nil?

    discount_multiplier = 1 - ((discount_percent || 0).to_d / 100)
    tariff_multiplier = 1 + ((tariff_percent || 0).to_d / 100)
    (unit_price * discount_multiplier * tariff_multiplier).round(4)
  end
end
