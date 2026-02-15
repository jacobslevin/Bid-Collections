class Invite < ApplicationRecord
  belongs_to :bid_package
  has_one :bid, dependent: :destroy

  has_secure_password
  has_secure_token :token

  validates :dealer_name, presence: true
  validates :token, presence: true, uniqueness: true
end
