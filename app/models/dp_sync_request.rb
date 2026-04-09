class DpSyncRequest < ApplicationRecord
  belongs_to :project
  belongs_to :bid_package

  enum status: { queued: 0, running: 1, completed: 2, failed: 3 }

  validates :sync_id, presence: true, uniqueness: true
  validates :idempotency_key, presence: true, uniqueness: true

  def errors_json
    self[:errors_json]
  end
end

