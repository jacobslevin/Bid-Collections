class BidPackage < ApplicationRecord
  belongs_to :project
  has_many :spec_items, dependent: :destroy
  has_many :invites, dependent: :destroy

  validates :name, :source_filename, :imported_at, presence: true
end
