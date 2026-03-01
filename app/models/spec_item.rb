class SpecItem < ApplicationRecord
  belongs_to :bid_package

  has_many :bid_line_items, dependent: :destroy
  has_many :spec_item_requirement_approvals, dependent: :destroy
  has_many :post_award_uploads, dependent: :destroy

  scope :active, -> { where(active: true) }

  validates :spec_item_id, :category, :manufacturer, :product_name,
            :quantity, :uom, presence: true
  validates :quantity, numericality: { greater_than: 0 }
  validates :spec_item_id, uniqueness: { scope: :bid_package_id }
end
