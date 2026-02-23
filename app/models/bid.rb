class Bid < ApplicationRecord
  belongs_to :invite
  has_many :bid_line_items, dependent: :destroy
  has_many :bid_submission_versions, dependent: :destroy

  enum :state, { draft: 0, submitted: 1 }, default: :draft

  validates :state, presence: true
  validates :delivery_amount, :install_amount, :escalation_amount, :contingency_amount, :sales_tax_amount,
            numericality: { greater_than_or_equal_to: 0 }, allow_nil: true

  before_update :prevent_edit_after_submit

  def create_submission_version!
    items = bid_line_items.includes(:spec_item).map do |line_item|
      spec_item = line_item.spec_item
      {
        spec_item_id: spec_item.id,
        code_tag: spec_item.sku,
        product_name: spec_item.product_name,
        brand_name: spec_item.manufacturer,
        quantity: spec_item.quantity&.to_s,
        uom: spec_item.uom,
        unit_list_price: line_item.unit_price&.to_s,
        discount_percent: line_item.discount_percent&.to_s,
        tariff_percent: line_item.tariff_percent&.to_s,
        unit_net_price: line_item.unit_net_price&.to_s,
        extended_price: line_item.unit_net_price ? (spec_item.quantity * line_item.unit_net_price).round(4).to_s : nil,
        unit_price: line_item.unit_price&.to_s,
        lead_time_days: line_item.lead_time_days,
        dealer_notes: line_item.dealer_notes
      }
    end

    subtotal = items.sum { |row| row[:extended_price].present? ? BigDecimal(row[:extended_price]) : 0 }
    total = subtotal + (delivery_amount || 0).to_d + (install_amount || 0).to_d +
            (escalation_amount || 0).to_d + (contingency_amount || 0).to_d + (sales_tax_amount || 0).to_d

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
