module Api
  module Admin
    class ComparisonsController < Api::BaseController
      def show
        bid_package = BidPackage.find(params[:bid_package_id])
        price_modes = params[:price_mode].is_a?(ActionController::Parameters) ? params[:price_mode].to_unsafe_h : {}
        cell_price_modes = params[:cell_price_mode].is_a?(ActionController::Parameters) ? params[:cell_price_mode].to_unsafe_h : {}
        excluded_spec_item_ids = Array(params[:excluded_spec_item_ids]).map(&:to_i).uniq

        payload = Comparison::BidPackageComparisonService.new(
          bid_package: bid_package,
          price_modes: price_modes,
          cell_price_modes: cell_price_modes,
          excluded_spec_item_ids: excluded_spec_item_ids
        ).call
        render json: payload
      end
    end
  end
end
