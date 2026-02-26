module Api
  module Admin
    class ExportsController < Api::BaseController
      def show
        bid_package = BidPackage.find(params[:bid_package_id])
        price_modes = params[:price_mode].is_a?(ActionController::Parameters) ? params[:price_mode].to_unsafe_h : {}
        excluded_spec_item_ids = Array(params[:excluded_spec_item_ids]).map(&:to_i).uniq
        requested_format = params[:format].to_s.downcase

        if requested_format == 'xlsx'
          xlsx_output = Exports::BidPackageComparisonXlsxService.new(
            bid_package: bid_package,
            price_modes: price_modes,
            excluded_spec_item_ids: excluded_spec_item_ids
          ).call
          send_data xlsx_output,
                    filename: "bid_package_#{bid_package.id}_comparison.xlsx",
                    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        else
          csv_output = Exports::BidPackageComparisonCsvService.new(
            bid_package: bid_package,
            price_modes: price_modes,
            excluded_spec_item_ids: excluded_spec_item_ids
          ).call
          send_data csv_output,
                    filename: "bid_package_#{bid_package.id}_comparison.csv",
                    type: 'text/csv; charset=utf-8'
        end
      end
    end
  end
end
