module Api
  module Admin
    class ExportsController < Api::BaseController
      def show
        bid_package = BidPackage.find(params[:bid_package_id])
        csv_output = Exports::BidPackageComparisonCsvService.new(bid_package: bid_package).call

        send_data csv_output,
                  filename: "bid_package_#{bid_package.id}_comparison.csv",
                  type: 'text/csv; charset=utf-8'
      end
    end
  end
end
