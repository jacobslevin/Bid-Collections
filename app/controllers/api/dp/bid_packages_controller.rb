module Api
  module Dp
    class BidPackagesController < Api::Dp::BaseController
      # GET /api/projects/:project_id/bid_packages
      def index
        project = Project.find_by!(dp_project_id: params[:project_id].to_s)
        packages = project.bid_packages.order(created_at: :desc).select(:id, :name)

        render json: {
          project_id: project.dp_project_id.to_s,
          bid_packages: packages.map { |pkg| { id: pkg.id.to_s, name: pkg.name } }
        }
      end

      # POST /api/projects/:project_id/bid_packages/sync
      #
      # See request/response contract in requirements.
      def sync
        project = Project.find_by!(dp_project_id: params[:project_id].to_s)

        package_id = params[:package_id].presence
        package_name = params[:package_name].to_s.strip
        requested_by = params[:requested_by].to_s.presence
        ids = Array(params[:project_product_ids]).map(&:to_s).map(&:strip).reject(&:blank?).uniq

        return render_unprocessable!(["project_product_ids is required"]) if ids.empty?
        return render_unprocessable!(["package_name is required when package_id is null"]) if package_id.blank? && package_name.blank?

        idempotency_key = request.headers['Idempotency-Key'].to_s.strip
        return render_unprocessable!(["Idempotency-Key header is required"]) if idempotency_key.blank?

        existing = DpSyncRequest.find_by(idempotency_key: idempotency_key)
        if existing
          return render json: {
            status: existing.status,
            sync_id: existing.sync_id,
            package_id: existing.bid_package_id&.to_s
          }, status: :accepted
        end

        bid_package =
          if package_id.present?
            project.bid_packages.find(package_id)
          else
            project.bid_packages.create!(
              name: package_name,
              source_filename: 'dp_sync',
              imported_at: Time.current,
              visibility: :private,
              active_general_fields: BidPackage::GENERAL_PRICING_FIELDS,
              instructions: nil
            )
          end

        sync = DpSyncRequest.create!(
          sync_id: SecureRandom.uuid,
          status: :queued,
          project_id: project.id,
          bid_package_id: bid_package.id,
          idempotency_key: idempotency_key,
          requested_by: requested_by,
          received_ids: ids
        )

        DpSyncJob.perform_later(sync.id)

        render json: { status: 'queued', sync_id: sync.sync_id, package_id: bid_package.id.to_s }, status: :accepted
      end
    end
  end
end

