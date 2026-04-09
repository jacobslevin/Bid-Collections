module Api
  module Dp
    class SyncController < Api::Dp::BaseController
      # GET /api/sync/:sync_id
      def show
        sync = DpSyncRequest.find_by!(sync_id: params[:sync_id].to_s)

        render json: {
          sync_id: sync.sync_id,
          status: sync.status,
          package_id: sync.bid_package_id&.to_s,
          counts: {
            received_ids: sync.received_ids.is_a?(Array) ? sync.received_ids.length : 0,
            resolved: sync.resolved_count.to_i,
            missing: sync.missing_count.to_i
          },
          errors: Array(sync.errors_json)
        }
      end
    end
  end
end

