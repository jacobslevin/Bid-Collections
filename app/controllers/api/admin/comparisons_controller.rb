module Api
  module Admin
    class ComparisonsController < Api::BaseController
      def show
        bid_package = BidPackage.find(params[:bid_package_id])

        payload = Comparison::BidPackageComparisonService.new(bid_package: bid_package).call
        render json: payload
      end
    end
  end
end
