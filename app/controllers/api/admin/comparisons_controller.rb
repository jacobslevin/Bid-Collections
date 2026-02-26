module Api
  module Admin
    class ComparisonsController < Api::BaseController
      def show
        bid_package = BidPackage.find(params[:bid_package_id])
        price_modes = params[:price_mode].is_a?(ActionController::Parameters) ? params[:price_mode].to_unsafe_h : {}

        payload = Comparison::BidPackageComparisonService.new(bid_package: bid_package, price_modes: price_modes).call
        render json: payload
      end
    end
  end
end
