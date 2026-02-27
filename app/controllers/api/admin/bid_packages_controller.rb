module Api
  module Admin
    class BidPackagesController < Api::BaseController
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
          public_url: bid_package.visibility_public? ? "/public/bid-packages/#{bid_package.public_token}" : nil
        }
      end
    end
  end
end
