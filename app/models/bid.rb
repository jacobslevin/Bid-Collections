class Bid < ApplicationRecord
  belongs_to :invite
  has_many :bid_line_items, dependent: :destroy
  has_many :bid_submission_versions, dependent: :destroy

  enum :state, { draft: 0, submitted: 1 }, default: :draft

  validates :state, presence: true

  before_update :prevent_edit_after_submit

  def create_submission_version!
    items = bid_line_items.includes(:spec_item).map do |line_item|
      spec_item = line_item.spec_item
      {
        spec_item_id: spec_item.id,
        code_tag: spec_item.sku,
        product_name: spec_item.product_name,
        quantity: spec_item.quantity&.to_s,
        uom: spec_item.uom,
        unit_price: line_item.unit_price&.to_s,
        lead_time_days: line_item.lead_time_days,
        dealer_notes: line_item.dealer_notes
      }
    end

    total = items.sum do |row|
      quantity = BigDecimal(row[:quantity].to_s)
      unit_price = row[:unit_price].present? ? BigDecimal(row[:unit_price].to_s) : nil
      unit_price ? (quantity * unit_price) : 0
    end

    bid_submission_versions.create!(
      version_number: (bid_submission_versions.maximum(:version_number) || 0) + 1,
      submitted_at: submitted_at || Time.current,
      total_amount: total,
      line_items_snapshot: items
    )
  end

  private

  def prevent_edit_after_submit
    return unless submitted? && state_in_database == 'submitted'

    errors.add(:base, 'Submitted bids are locked and cannot be edited')
    throw(:abort)
  end
end
