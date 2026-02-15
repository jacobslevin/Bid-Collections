class Bid < ApplicationRecord
  belongs_to :invite
  has_many :bid_line_items, dependent: :destroy

  enum :state, { draft: 0, submitted: 1 }, default: :draft

  validates :state, presence: true

  before_update :prevent_edit_after_submit

  private

  def prevent_edit_after_submit
    return unless submitted? && state_in_database == 'submitted'

    errors.add(:base, 'Submitted bids are locked and cannot be edited')
    throw(:abort)
  end
end
