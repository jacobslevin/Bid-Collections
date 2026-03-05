require 'csv'

module Exports
  class ApprovalTrackingMatrixCsvService
    def initialize(bid_package:)
      @bid_package = bid_package
    end

    def call
      data = Exports::ApprovalTrackingMatrixExportData.new(bid_package: @bid_package).call

      CSV.generate(headers: true) do |csv|
        csv << data[:headers]
        data[:rows].each { |row| csv << row }
      end
    end
  end
end
