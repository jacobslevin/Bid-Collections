require 'bid_collections/routes'

Rails.application.routes.draw do
  BidCollections::Routes.draw(self)
end
