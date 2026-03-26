require 'zip'

module Api
  module Admin
    class BidPackagesController < Api::BaseController
      before_action :ensure_not_awarded!, only: [:update, :import_rows, :deactivate_spec_item, :reactivate_spec_item]

      def index
        bid_packages = BidPackage
                       .includes(:project, :invites, :spec_items, awarded_bid: :invite)
                       .order(created_at: :desc)
                       .limit(200)

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

        spec_item, requirement_key = load_valid_requirement!(bid_package)
        return if performed?

        approved_at = params[:approved_at].present? ? Time.zone.parse(params[:approved_at].to_s) : Time.current
        approval = find_or_initialize_requirement_approval(bid_package, spec_item.id, requirement_key)
        existing_needs_fix_dates = approval.needs_fix_dates_array
        approval.status = :approved
        approval.approved_at = approved_at
        approval.approved_by = params[:approved_by].presence || 'Designer'
        approval.needs_fix_dates = existing_needs_fix_dates
        append_action_history(approval, action: 'approved', at: approved_at)
        approval.save!

        render json: {
          status: approval.status,
          approved: true,
          spec_item_id: spec_item.id,
          requirement_key: requirement_key,
          approved_at: approval.approved_at,
          approved_by: approval.approved_by,
          needs_fix_dates: approval.needs_fix_dates_array
        }
      rescue StandardError => e
        render_award_exception(e)
      end

      def mark_spec_item_requirement_needs_fix
        bid_package = BidPackage.find(params[:id])

        spec_item, requirement_key = load_valid_requirement!(bid_package)
        return if performed?

        needs_fix_at = params[:needs_fix_at].present? ? Time.zone.parse(params[:needs_fix_at].to_s) : Time.current
        approval = find_or_initialize_requirement_approval(bid_package, spec_item.id, requirement_key)
        needs_fix_dates = approval.needs_fix_dates_array
        needs_fix_dates << needs_fix_at.iso8601

        approval.status = :needs_revision
        approval.approved_at = nil
        approval.approved_by = nil
        approval.needs_fix_dates = needs_fix_dates
        append_action_history(approval, action: 'needs_fix', at: needs_fix_at)
        approval.save!

        render json: {
          status: approval.status,
          spec_item_id: spec_item.id,
          requirement_key: requirement_key,
          needs_fix_dates: approval.needs_fix_dates_array,
          needs_fix_at: needs_fix_dates.last
        }
      rescue StandardError => e
        render_award_exception(e)
      end

      def unapprove_spec_item_requirement
        bid_package = BidPackage.find(params[:id])

        spec_item, requirement_key = load_valid_requirement!(bid_package)
        return if performed?

        action_type = params[:action_type].to_s == 'reset' ? 'reset' : 'unapproved'
        action_at = params[:action_at].present? ? Time.zone.parse(params[:action_at].to_s) : Time.current
        approval = find_or_initialize_requirement_approval(bid_package, spec_item.id, requirement_key)
        approval.status = :pending
        approval.approved_at = nil
        approval.approved_by = nil
        append_action_history(approval, action: action_type, at: action_at)
        approval.save!

        render json: {
          status: 'pending',
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

      def download_post_award_uploads_bundle
        bid_package = BidPackage.find(params[:id])
        upload_ids = parse_upload_ids(params[:upload_ids])
        uploads_scope = bid_package.post_award_uploads
        uploads_scope = uploads_scope.where(id: upload_ids) if upload_ids.any?
        uploads = uploads_scope.order(created_at: :desc).to_a.select(&:file_available?)
        return render json: { error: 'No files available to download' }, status: :not_found if uploads.empty?

        include_tag = ActiveModel::Type::Boolean.new.cast(params[:include_tag])
        include_code = ActiveModel::Type::Boolean.new.cast(params[:include_code])
        requirement_labels = build_requirement_labels_for_bundle(bid_package, uploads)
        spec_codes = build_spec_codes_for_bundle(bid_package, uploads)

        temp_file = Tempfile.new(["post-award-files-#{bid_package.id}-", '.zip'])
        begin
          entry_names = {}
          Zip::File.open(temp_file.path, Zip::File::CREATE) do |zip|
            uploads.each do |upload|
              requested_name = upload.file_name.presence || "file-#{upload.id}"
              final_name = build_bundle_filename(
                file_name: requested_name,
                code_tag: spec_codes[upload.spec_item_id],
                requirement_label: requirement_labels[upload.requirement_key],
                include_requirement_tag: include_tag,
                include_code_tag: include_code
              )
              unique_name = unique_zip_entry_name(final_name, entry_names)
              zip.add(unique_name, upload.stored_file_path.to_s)
            end
          end

          send_file temp_file.path,
                    filename: "line-item-files-#{bid_package.id}-#{Time.current.strftime('%Y%m%d-%H%M%S')}.zip",
                    type: 'application/zip',
                    disposition: 'attachment'
        ensure
          temp_file.close!
        end
      end

      def create_post_award_upload
        bid_package = BidPackage.find(params[:id])

        spec_item = nil
        spec_item_id = params[:spec_item_id].presence
        spec_item = bid_package.spec_items.find(spec_item_id) if spec_item_id.present?
        requirement_key = validated_upload_requirement_key(spec_item)
        return if performed?

        uploaded_file = params[:file]
        upload = bid_package.post_award_uploads.create!(
          spec_item: spec_item,
          uploader_role: :designer,
          file_name: uploaded_file&.original_filename.presence || params.require(:file_name),
          note: params[:note],
          requirement_key: requirement_key
        )
        upload.persist_uploaded_file!(uploaded_file) if uploaded_file.present?

        render json: {
          uploaded: true,
          upload: serialize_post_award_upload(upload, bid_package)
        }, status: :created
      rescue StandardError => e
        render json: { errors: [e.message] }, status: :unprocessable_entity
      end

      def update_post_award_upload
        bid_package = BidPackage.find(params[:id])
        upload = bid_package.post_award_uploads.find(params[:upload_id])
        spec_item = upload.spec_item
        requirement_key = validated_upload_requirement_key(spec_item, params[:requirement_key], allow_blank: true)
        return if performed?

        upload.update!(requirement_key: requirement_key)
        render json: {
          updated: true,
          upload: serialize_post_award_upload(upload, bid_package)
        }
      rescue StandardError => e
        render json: { errors: [e.message] }, status: :unprocessable_entity
      end

      def delete_post_award_upload
        bid_package = BidPackage.find(params[:id])
        upload = bid_package.post_award_uploads.find(params[:upload_id])
        return render json: { error: 'Only designer uploads can be deleted from this view' }, status: :forbidden if upload.vendor?

        file_path = upload.file_available? ? upload.stored_file_path.to_s : nil
        upload.destroy!
        File.delete(file_path) if file_path.present? && File.exist?(file_path)

        render json: { deleted: true, upload_id: upload.id }
      rescue StandardError => e
        render json: { errors: [e.message] }, status: :unprocessable_entity
      end

      private

      def package_settings_params
        params.permit(:visibility, :instructions, active_general_fields: [])
      end

      def update_params
        params.permit(:name, :visibility, :instructions, active_general_fields: [])
      end

      def serialize_bid_package(bid_package)
        spec_items = bid_package.association(:spec_items).loaded? ? bid_package.spec_items : bid_package.spec_items.to_a
        active_spec_item_count = spec_items.count(&:active?)
        invite_count = bid_package.association(:invites).loaded? ? bid_package.invites.size : bid_package.invites.count
        awarded_dealer_name = bid_package.awarded_bid&.invite&.dealer_name

        {
          id: bid_package.id,
          name: bid_package.name,
          project_id: bid_package.project_id,
          project_name: bid_package.project&.name,
          created_at: bid_package.created_at,
          imported_at: bid_package.imported_at,
          spec_item_count: active_spec_item_count,
          invite_count: invite_count,
          awarded_dealer_name: awarded_dealer_name,
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

      def load_valid_requirement!(bid_package)
        spec_item = bid_package.spec_items.find(params[:spec_item_id])
        requirement_key = params.require(:requirement_key).to_s
        allowed_keys = PostAward::RequiredApprovalsService.requirements_for_spec_item(spec_item).map { |req| req[:key] }
        unless allowed_keys.include?(requirement_key)
          render json: { errors: ['Requirement does not apply to this line item'] }, status: :unprocessable_entity
          return
        end

        [spec_item, requirement_key]
      end

      def find_or_initialize_requirement_approval(bid_package, spec_item_id, requirement_key)
        bid_package.spec_item_requirement_approvals.find_or_initialize_by(
          spec_item_id: spec_item_id,
          requirement_key: requirement_key,
          bid_id: bid_package.awarded_bid_id
        )
      end

      def append_action_history(approval, action:, at:)
        history = approval.action_history_array
        history << {
          action: action,
          at: at.iso8601
        }
        approval.action_history = history
      end

      def serialize_post_award_upload(upload, bid_package)
        {
          id: upload.id,
          file_name: upload.file_name,
          note: upload.note,
          requirement_key: upload.requirement_key,
          byte_size: upload.byte_size,
          uploader_role: upload.uploader_role,
          uploaded_by: upload.invite&.dealer_name || upload.uploader_role.to_s.titleize,
          uploaded_at: upload.created_at,
          spec_item_id: upload.spec_item_id,
          download_url: upload.file_available? ? "/api/bid_packages/#{bid_package.id}/post_award_uploads/#{upload.id}/download" : nil
        }
      end

      def validated_upload_requirement_key(spec_item, raw_value = nil, allow_blank: false)
        raw = raw_value.nil? ? params[:requirement_key] : raw_value
        raw = raw.presence
        return nil if raw.blank? && allow_blank
        return nil if raw.blank?
        return nil unless spec_item

        key = raw.to_s
        allowed_keys = PostAward::RequiredApprovalsService.requirements_for_spec_item(spec_item).map { |req| req[:key] }
        return key if allowed_keys.include?(key)

        render json: { errors: ['Requirement tag does not apply to this line item'] }, status: :unprocessable_entity
        nil
      end

      def parse_upload_ids(value)
        Array(value)
          .flat_map { |item| item.to_s.split(',') }
          .map(&:strip)
          .reject(&:blank?)
          .map(&:to_i)
          .uniq
      end

      def build_requirement_labels_for_bundle(bid_package, uploads)
        spec_item_ids = uploads.map(&:spec_item_id).compact.uniq
        return {} if spec_item_ids.empty?

        specs_by_id = bid_package.spec_items.where(id: spec_item_ids).index_by(&:id)
        labels = {}
        uploads.each do |upload|
          next if upload.requirement_key.blank?
          next if labels.key?(upload.requirement_key)

          spec_item = specs_by_id[upload.spec_item_id]
          requirement = spec_item && PostAward::RequiredApprovalsService
            .requirements_for_spec_item(spec_item)
            .find { |row| row[:key] == upload.requirement_key }
          labels[upload.requirement_key] = requirement&.dig(:label) || upload.requirement_key.to_s.humanize
        end
        labels
      end

      def build_spec_codes_for_bundle(bid_package, uploads)
        spec_item_ids = uploads.map(&:spec_item_id).compact.uniq
        return {} if spec_item_ids.empty?

        bid_package.spec_items.where(id: spec_item_ids).pluck(:id, :sku).to_h
      end

      def build_bundle_filename(file_name:, code_tag:, requirement_label:, include_requirement_tag:, include_code_tag:)
        base_name = file_name.to_s
        dot = base_name.rindex('.')
        stem = (dot && dot.positive?) ? base_name[0...dot] : base_name
        ext = (dot && dot.positive?) ? base_name[dot..-1] : ''

        code = include_code_tag ? normalize_download_token(code_tag) : ''
        requirement = include_requirement_tag ? normalize_download_token(requirement_label) : ''
        parts = [code, requirement, stem].reject(&:blank?)
        return base_name if parts.empty?

        "#{parts.join('_')}#{ext}"
      end

      def normalize_download_token(value)
        value.to_s.strip.gsub(/[^a-zA-Z0-9-]+/, '_').gsub(/^_+|_+$/, '')
      end

      def unique_zip_entry_name(name, taken_names)
        base = name
        ext = ''
        if (dot = name.rindex('.')) && dot.positive?
          base = name[0...dot]
          ext = name[dot..-1]
        end

        candidate = name
        counter = 2
        while taken_names[candidate]
          candidate = "#{base} (#{counter})#{ext}"
          counter += 1
        end
        taken_names[candidate] = true
        candidate
      end
    end
  end
end
