module Api
  module Public
    class BidPackagesController < Api::BaseController
      def show
        bid_package = BidPackage.includes(:project, :spec_items).find_by!(
          public_token: params[:token],
          visibility: BidPackage.visibilities[:public]
        )

        render json: {
          bid_package: {
            id: bid_package.id,
            name: bid_package.name,
            project_name: bid_package.project&.name,
            instructions: bid_package.instructions,
            active_general_fields: bid_package.active_general_fields,
            visibility: bid_package.visibility,
            line_items: bid_package.spec_items.order(:id).map do |item|
              {
                spec_item_id: item.id,
                code_tag: item.sku,
                product_name: item.product_name,
                brand_name: item.manufacturer,
                quantity: item.quantity,
                uom: item.uom,
                category: item.category,
                notes: item.notes
              }
            end
          }
        }
      end
    end
  end
end
