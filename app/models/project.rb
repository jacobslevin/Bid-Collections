class Project < ApplicationRecord
  has_many :bid_packages, dependent: :destroy

  validates :name, presence: true
end
