module Api
  module Admin
    class ComparisonsController < Api::BaseController
      def show
        bid_package = BidPackage.find(params[:bid_package_id])
        price_modes = params[:price_mode].is_a?(ActionController::Parameters) ? params[:price_mode].to_unsafe_h : {}
        requested_cell_price_modes = params[:cell_price_mode].is_a?(ActionController::Parameters) ? params[:cell_price_mode].to_unsafe_h : {}
        requested_excluded_spec_item_ids = Array(params[:excluded_spec_item_ids]).map(&:to_i).uniq
        award_snapshot = latest_award_comparison_snapshot_for(bid_package)
        snapshot_cell_price_modes = award_snapshot.is_a?(Hash) ? (award_snapshot['cell_price_mode'] || award_snapshot[:cell_price_mode] || {}) : {}
        snapshot_excluded_spec_item_ids = award_snapshot.is_a?(Hash) ? Array(award_snapshot['excluded_spec_item_ids'] || award_snapshot[:excluded_spec_item_ids]).map(&:to_i).uniq : []
        cell_price_modes = requested_cell_price_modes.present? ? requested_cell_price_modes : snapshot_cell_price_modes
        excluded_spec_item_ids = requested_excluded_spec_item_ids.present? ? requested_excluded_spec_item_ids : snapshot_excluded_spec_item_ids
        include_inactive = ActiveModel::Type::Boolean.new.cast(params[:include_inactive])

        payload = Comparison::BidPackageComparisonService.new(
          bid_package: bid_package,
          price_modes: price_modes,
          cell_price_modes: cell_price_modes,
          excluded_spec_item_ids: excluded_spec_item_ids,
          include_inactive: include_inactive
        ).call
        render json: payload
      end

      private

      def latest_award_comparison_snapshot_for(bid_package)
        return {} unless bid_package.awarded_bid_id.present?

        event = bid_package
                  .bid_award_events
                  .where(to_bid_id: bid_package.awarded_bid_id, event_type: %w[award reassign])
                  .order(awarded_at: :desc, id: :desc)
                  .first
        event&.comparison_snapshot.is_a?(Hash) ? event.comparison_snapshot : {}
      end
    end
  end
end
