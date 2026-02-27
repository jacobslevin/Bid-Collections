module CsvImports
  class BidPackageAppendService
    Result = Struct.new(:success?, :bid_package, :imported_items_count, :errors, keyword_init: true)

    def initialize(bid_package:, source_filename:, parsed_rows:)
      @bid_package = bid_package
      @source_filename = source_filename
      @parsed_rows = parsed_rows
    end

    def call
      imported_count = 0

      ActiveRecord::Base.transaction do
        @parsed_rows.each do |row|
          @bid_package.spec_items.create!(row)
          imported_count += 1
        end

        @bid_package.update!(
          source_filename: @source_filename,
          imported_at: Time.current
        )
      end

      Result.new(
        success?: true,
        bid_package: @bid_package,
        imported_items_count: imported_count,
        errors: []
      )
    rescue ActiveRecord::RecordInvalid => e
      Result.new(success?: false, bid_package: @bid_package, imported_items_count: 0, errors: e.record.errors.full_messages)
    end
  end
end
