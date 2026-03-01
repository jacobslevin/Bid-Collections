class BidPackage < ApplicationRecord
  GENERAL_PRICING_FIELDS = %w[
    delivery_amount
    install_amount
    escalation_amount
    contingency_amount
    sales_tax_amount
  ].freeze

  belongs_to :project
  belongs_to :awarded_bid, class_name: 'Bid', optional: true
  has_many :spec_items, dependent: :destroy
  has_many :invites, dependent: :destroy
  has_many :bids, through: :invites
  has_many :bid_award_events, dependent: :destroy
  has_many :spec_item_requirement_approvals, dependent: :destroy
  has_many :post_award_uploads, dependent: :destroy

  enum :visibility, { private: 0, public: 1 }, default: :private, prefix: :visibility

  validates :name, :source_filename, :imported_at, presence: true

  before_validation :normalize_active_general_fields
  before_validation :ensure_public_token

  def active_general_fields
    configured = self[:active_general_fields]
    fields = configured.is_a?(Array) ? configured.map(&:to_s) : GENERAL_PRICING_FIELDS
    fields & GENERAL_PRICING_FIELDS
  end

  def active_general_field?(field_key)
    active_general_fields.include?(field_key.to_s)
  end

  def awarded?
    awarded_bid_id.present?
  end

  private

  def normalize_active_general_fields
    self[:active_general_fields] = self.class::GENERAL_PRICING_FIELDS if self[:active_general_fields].nil?
    self.active_general_fields = active_general_fields
  end

  def ensure_public_token
    self.public_token = SecureRandom.urlsafe_base64(18) if public_token.blank?
  end
end
