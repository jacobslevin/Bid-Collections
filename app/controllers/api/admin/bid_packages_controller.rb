module Api
  module Admin
    class BidPackagesController < Api::BaseController
      before_action :ensure_not_awarded!, only: [:update, :import_rows, :deactivate_spec_item, :reactivate_spec_item]

      def index
        bid_packages = BidPackage.includes(:project).order(created_at: :desc).limit(200)

        render json: {
          bid_packages: bid_packages.map do |bid_package|
            serialize_bid_package(bid_package)
          end
        }
      end

      def preview
        Project.find(params[:project_id])

        result = CsvImports::BidPackagePreviewService.new(
          csv_content: params.require(:csv_content),
          source_profile: params[:source_profile]
        ).call

        if result.valid?
          render json: {
            valid: true,
            source_profile: result.profile,
            row_count: result.row_count,
            sample_rows: result.rows.first(10)
          }
        else
          render json: {
            valid: false,
            row_count: result.row_count,
            errors: result.errors
          }, status: :unprocessable_entity
        end
      end

      def create
        project = Project.find(params[:project_id])

        preview = CsvImports::BidPackagePreviewService.new(
          csv_content: params.require(:csv_content),
          source_profile: params[:source_profile]
        ).call

        return render_unprocessable!(preview.errors) unless preview.valid?

        result = CsvImports::BidPackageCommitService.new(
          project: project,
          package_name: params.require(:name),
          source_filename: params.require(:source_filename),
          parsed_rows: preview.rows,
          visibility: package_settings_params[:visibility],
          active_general_fields: package_settings_params[:active_general_fields],
          instructions: package_settings_params[:instructions]
        ).call

        if result.success?
          render json: {
            bid_package: serialize_bid_package(result.bid_package),
            imported_items_count: result.imported_items_count
          }, status: :created
        else
          render_unprocessable!(result.errors)
        end
      end

      def update
        bid_package = BidPackage.find(params[:id])
        bid_package.update!(update_params)

        render json: { bid_package: serialize_bid_package(bid_package) }
      rescue ActiveRecord::RecordInvalid => e
        render_unprocessable!(e.record.errors.full_messages)
      end

      def destroy
        bid_package = BidPackage.find(params[:id])
        bid_package.destroy!

        render json: { deleted: true, bid_package_id: bid_package.id }
      end

      def import_rows
        bid_package = BidPackage.find(params[:id])

        preview = CsvImports::BidPackagePreviewService.new(
          csv_content: params.require(:csv_content),
          source_profile: params[:source_profile]
        ).call

        return render_unprocessable!(preview.errors) unless preview.valid?

        result = CsvImports::BidPackageAppendService.new(
          bid_package: bid_package,
          source_filename: params.require(:source_filename),
          parsed_rows: preview.rows
        ).call

        if result.success?
          render json: {
            bid_package: serialize_bid_package(result.bid_package),
            imported_items_count: result.imported_items_count
          }
        else
          render_unprocessable!(result.errors)
        end
      end

      def deactivate_spec_item
        bid_package = BidPackage.find(params[:id])
        spec_item = bid_package.spec_items.find(params[:spec_item_id])
        spec_item.update!(active: false)

        render json: { deactivated: true, spec_item_id: spec_item.id }
      rescue ActiveRecord::RecordInvalid => e
        render_unprocessable!(e.record.errors.full_messages)
      end

      def reactivate_spec_item
        bid_package = BidPackage.find(params[:id])
        spec_item = bid_package.spec_items.find(params[:spec_item_id])
        spec_item.update!(active: true)

        render json: { reactivated: true, spec_item_id: spec_item.id }
      rescue ActiveRecord::RecordInvalid => e
        render_unprocessable!(e.record.errors.full_messages)
      end

      def award
        bid_package = BidPackage.find(params[:id])
        bid = bid_package.bids.includes(:invite).find(params.require(:bid_id))

        result = Awards::BidPackageAwardService.new(
          bid_package: bid_package,
          bid: bid,
          awarded_by: awarding_user_name,
          note: params[:note],
          awarded_amount_snapshot: params[:awarded_amount_snapshot],
          comparison_snapshot: comparison_snapshot_params,
          allow_reassign: false
        ).call

        return render_award_success(result) if result.success?

        render_award_failure(result)
      rescue StandardError => e
        render_award_exception(e)
      end

      def change_award
        bid_package = BidPackage.find(params[:id])
        bid = bid_package.bids.includes(:invite).find(params.require(:bid_id))

        result = Awards::BidPackageAwardService.new(
          bid_package: bid_package,
          bid: bid,
          awarded_by: awarding_user_name,
          note: params[:note],
          awarded_amount_snapshot: params[:awarded_amount_snapshot],
          comparison_snapshot: comparison_snapshot_params,
          allow_reassign: true
        ).call

        return render_award_success(result) if result.success?

        render_award_failure(result)
      rescue StandardError => e
        render_award_exception(e)
      end

      def clear_award
        bid_package = BidPackage.find(params[:id])

        result = Awards::BidPackageClearAwardService.new(
          bid_package: bid_package,
          awarded_by: awarding_user_name,
          note: params[:note],
          awarded_amount_snapshot: params[:awarded_amount_snapshot],
          comparison_snapshot: comparison_snapshot_params
        ).call

        if result.success?
          event = result.bid_award_event
          render json: {
            cleared: true,
            bid_package_id: result.bid_package.id,
            awarded_bid_id: result.bid_package.awarded_bid_id,
            awarded_at: result.bid_package.awarded_at,
            award_event: {
              id: event.id,
              event_type: event.event_type,
              from_bid_id: event.from_bid_id,
              to_bid_id: event.to_bid_id,
              awarded_amount_snapshot: event.awarded_amount_snapshot,
              awarded_by: event.awarded_by,
              note: event.note,
              awarded_at: event.awarded_at,
              comparison_snapshot: event.comparison_snapshot
            }
          }
        else
          render_award_failure(result)
        end
      rescue StandardError => e
        render_award_exception(e)
      end

      def approve_spec_item_requirement
        bid_package = BidPackage.find(params[:id])
        return render json: { errors: ['Bid package is not awarded'] }, status: :conflict unless bid_package.awarded?

        spec_item = bid_package.spec_items.find(params[:spec_item_id])
        requirement_key = params.require(:requirement_key).to_s
        allowed_keys = PostAward::RequiredApprovalsService.requirements_for_spec_item(spec_item).map { |req| req[:key] }
        unless allowed_keys.include?(requirement_key)
          return render json: { errors: ['Requirement does not apply to this line item'] }, status: :unprocessable_entity
        end

        approved_at = params[:approved_at].present? ? Time.zone.parse(params[:approved_at].to_s) : Time.current
        approval = bid_package.spec_item_requirement_approvals.find_or_initialize_by(
          spec_item_id: spec_item.id,
          requirement_key: requirement_key,
          bid_id: bid_package.awarded_bid_id
        )
        approval.approved_at = approved_at
        approval.approved_by = params[:approved_by].presence || 'Designer'
        approval.save!

        render json: {
          approved: true,
          spec_item_id: spec_item.id,
          requirement_key: requirement_key,
          approved_at: approval.approved_at,
          approved_by: approval.approved_by
        }
      rescue StandardError => e
        render_award_exception(e)
      end

      def unapprove_spec_item_requirement
        bid_package = BidPackage.find(params[:id])
        return render json: { errors: ['Bid package is not awarded'] }, status: :conflict unless bid_package.awarded?

        spec_item = bid_package.spec_items.find(params[:spec_item_id])
        requirement_key = params.require(:requirement_key).to_s
        allowed_keys = PostAward::RequiredApprovalsService.requirements_for_spec_item(spec_item).map { |req| req[:key] }
        unless allowed_keys.include?(requirement_key)
          return render json: { errors: ['Requirement does not apply to this line item'] }, status: :unprocessable_entity
        end

        bid_package.spec_item_requirement_approvals.where(
          spec_item_id: spec_item.id,
          requirement_key: requirement_key,
          bid_id: bid_package.awarded_bid_id
        ).delete_all

        render json: {
          unapproved: true,
          spec_item_id: spec_item.id,
          requirement_key: requirement_key
        }
      rescue StandardError => e
        render_award_exception(e)
      end

      def clear_current_award_approvals
        bid_package = BidPackage.find(params[:id])
        return render json: { errors: ['Bid package is not awarded'] }, status: :conflict unless bid_package.awarded?

        deleted_count = bid_package.spec_item_requirement_approvals.where(bid_id: bid_package.awarded_bid_id).delete_all
        render json: { cleared: true, deleted_count: deleted_count, bid_id: bid_package.awarded_bid_id }
      rescue StandardError => e
        render_award_exception(e)
      end

      def download_post_award_upload
        bid_package = BidPackage.find(params[:id])
        upload = bid_package.post_award_uploads.find(params[:upload_id])
        return render json: { error: 'Uploaded file not found' }, status: :not_found unless upload.file_available?

        send_file upload.stored_file_path,
                  filename: upload.file_name,
                  type: upload.content_type.presence || 'application/octet-stream',
                  disposition: 'attachment'
      end

      private

      def package_settings_params
        params.permit(:visibility, :instructions, active_general_fields: [])
      end

      def update_params
        params.permit(:name, :visibility, :instructions, active_general_fields: [])
      end

      def serialize_bid_package(bid_package)
        {
          id: bid_package.id,
          name: bid_package.name,
          project_id: bid_package.project_id,
          project_name: bid_package.project&.name,
          visibility: bid_package.visibility,
          instructions: bid_package.instructions,
          active_general_fields: bid_package.active_general_fields,
          awarded_bid_id: bid_package.awarded_bid_id,
          awarded_at: bid_package.awarded_at,
          public_url: bid_package.visibility_public? ? "/public/bid-packages/#{bid_package.public_token}" : nil
        }
      end

      def render_award_success(result)
        event = result.bid_award_event
        render json: {
          awarded: true,
          bid_package_id: result.bid_package.id,
          awarded_bid_id: result.bid_package.awarded_bid_id,
          awarded_at: result.bid_package.awarded_at,
          award_event: {
            id: event.id,
            event_type: event.event_type,
            from_bid_id: event.from_bid_id,
            to_bid_id: event.to_bid_id,
            awarded_amount_snapshot: event.awarded_amount_snapshot,
            awarded_by: event.awarded_by,
            note: event.note,
            awarded_at: event.awarded_at,
            comparison_snapshot: event.comparison_snapshot
          }
        }
      end

      def render_award_failure(result)
        status = case result.error_key
                 when :already_awarded, :same_bid, :no_existing_award
                   :conflict
                 else
                   :unprocessable_entity
                 end

        render json: { errors: result.errors }, status: status
      end

      def awarding_user_name
        params[:awarded_by].presence || request.headers['X-Designer-User'].presence || 'Unknown'
      end

      def comparison_snapshot_params
        {
          excluded_spec_item_ids: Array(params[:excluded_spec_item_ids]).map(&:to_i).uniq,
          cell_price_mode: params[:cell_price_mode].is_a?(ActionController::Parameters) ? params[:cell_price_mode].to_unsafe_h : {}
        }
      end

      def ensure_not_awarded!
        bid_package = BidPackage.find(params[:id])
        return unless bid_package.awarded?

        render json: { error: 'Bid package is awarded and locked for bid package edits' }, status: :conflict
      end

      def render_award_exception(error)
        status = case error
                 when ActionController::ParameterMissing, ActiveRecord::RecordInvalid, ArgumentError
                   :unprocessable_entity
                 else
                   :internal_server_error
                 end

        Rails.logger.error("[Award] #{error.class}: #{error.message}")
        render json: { errors: [error.message] }, status: status
      end
    end
  end
end
