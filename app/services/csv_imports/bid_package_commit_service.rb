module CsvImports
  class BidPackageCommitService
    Result = Struct.new(:success?, :bid_package, :imported_items_count, :errors, keyword_init: true)

    def initialize(project:, package_name:, source_filename:, parsed_rows:, visibility: 'private', active_general_fields: nil, instructions: nil)
      @project = project
      @package_name = package_name
      @source_filename = source_filename
      @parsed_rows = parsed_rows
      @visibility = visibility
      @active_general_fields = active_general_fields
      @instructions = instructions
    end

    def call
      bid_package = nil

      ActiveRecord::Base.transaction do
        bid_package = @project.bid_packages.create!(
          name: @package_name,
          source_filename: @source_filename,
          imported_at: Time.current,
          visibility: @visibility,
          active_general_fields: @active_general_fields || BidPackage::GENERAL_PRICING_FIELDS,
          instructions: @instructions
        )

        @parsed_rows.each do |row|
          bid_package.spec_items.create!(row)
        end
      end

      Result.new(
        success?: true,
        bid_package: bid_package,
        imported_items_count: @parsed_rows.size,
        errors: []
      )
    rescue ActiveRecord::RecordInvalid => e
      Result.new(success?: false, bid_package: nil, imported_items_count: 0, errors: e.record.errors.full_messages)
    end
  end
end
