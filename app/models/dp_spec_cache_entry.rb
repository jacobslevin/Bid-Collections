class DpSpecCacheEntry < ApplicationRecord
  belongs_to :project

  validates :project_product_id, presence: true
  validates :project_product_id, uniqueness: { scope: :project_id }

  def payload_hash
    self[:payload]
  end
end

