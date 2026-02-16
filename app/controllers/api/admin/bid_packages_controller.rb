module Api
  module Admin
    class BidPackagesController < Api::BaseController
      def index
        bid_packages = BidPackage.includes(:project).order(created_at: :desc).limit(200)

        render json: {
          bid_packages: bid_packages.map do |bid_package|
            {
              id: bid_package.id,
              name: bid_package.name,
              project_id: bid_package.project_id,
              project_name: bid_package.project&.name
            }
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
          parsed_rows: preview.rows
        ).call

        if result.success?
          render json: {
            bid_package: result.bid_package,
            imported_items_count: result.imported_items_count
          }, status: :created
        else
          render_unprocessable!(result.errors)
        end
      end

      def destroy
        bid_package = BidPackage.find(params[:id])
        bid_package.destroy!

        render json: { deleted: true, bid_package_id: bid_package.id }
      end
    end
  end
end
