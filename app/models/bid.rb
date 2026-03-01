class Bid < ApplicationRecord
  belongs_to :invite
  has_one :bid_package, through: :invite
  has_many :bid_line_items, dependent: :destroy
  has_many :bid_submission_versions, dependent: :destroy

  enum :state, { draft: 0, submitted: 1 }, default: :draft
  enum :selection_status, { pending: 0, not_selected: 1, awarded: 2 }, default: :pending

  validates :state, presence: true
  validates :delivery_amount, :install_amount, :escalation_amount, :contingency_amount, :sales_tax_amount,
            numericality: { greater_than_or_equal_to: 0 }, allow_nil: true

  before_update :prevent_edit_after_submit

  def create_submission_version!
    items = bid_line_items.includes(:spec_item).map do |line_item|
      spec_item = line_item.spec_item
      display_product_name = line_item.is_substitution? ? (line_item.substitution_product_name.presence || spec_item.product_name) : spec_item.product_name
      display_brand_name = line_item.is_substitution? ? (line_item.substitution_brand_name.presence || spec_item.manufacturer) : spec_item.manufacturer

      {
        spec_item_id: spec_item.id,
        code_tag: spec_item.sku,
        product_name: display_product_name,
        brand_name: display_brand_name,
        quantity: spec_item.quantity&.to_s,
        uom: spec_item.uom,
        is_substitution: line_item.is_substitution?,
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
    total = subtotal + active_general_pricing_total

    bid_submission_versions.create!(
      version_number: (bid_submission_versions.maximum(:version_number) || 0) + 1,
      submitted_at: submitted_at || Time.current,
      total_amount: total,
      line_items_snapshot: items
    )
  end

  def active_general_pricing_total
    fields = invite&.bid_package&.active_general_fields || BidPackage::GENERAL_PRICING_FIELDS
    total = 0.to_d
    total += (delivery_amount || 0).to_d if fields.include?('delivery_amount')
    total += (install_amount || 0).to_d if fields.include?('install_amount')
    total += (escalation_amount || 0).to_d if fields.include?('escalation_amount')
    total += (contingency_amount || 0).to_d if fields.include?('contingency_amount')
    total += (sales_tax_amount || 0).to_d if fields.include?('sales_tax_amount')
    total
  end

  def latest_total_amount
    latest_submitted_total = bid_submission_versions.order(version_number: :desc).limit(1).pick(:total_amount)
    return latest_submitted_total.to_d if latest_submitted_total.present?

    subtotal = bid_line_items.includes(:spec_item).sum do |line_item|
      quantity = line_item.spec_item&.quantity
      unit_net = line_item.unit_net_price
      quantity && unit_net ? quantity * unit_net : 0
    end

    subtotal.to_d + active_general_pricing_total
  end

  private

  def prevent_edit_after_submit
    return unless submitted? && state_in_database == 'submitted'
    return if (changes_to_save.keys - %w[selection_status updated_at]).empty?

    errors.add(:base, 'Submitted bids are locked and cannot be edited')
    throw(:abort)
  end
end
