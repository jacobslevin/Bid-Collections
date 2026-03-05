module Exports
  class ApprovalTrackingAuditXlsxService
    def initialize(bid_package:)
      @bid_package = bid_package
    end

    def call
      data = Exports::ApprovalTrackingAuditExportData.new(bid_package: @bid_package).call

      package = Axlsx::Package.new
      workbook = package.workbook

      workbook.add_worksheet(name: 'Approval Audit') do |sheet|
        header_style = workbook.styles.add_style(
          b: true,
          bg_color: 'F1F5F9',
          border: { style: :thin, color: 'D1D5DB' },
          alignment: { horizontal: :center, vertical: :center, wrap_text: true }
        )
        body_style = workbook.styles.add_style(
          border: { style: :thin, color: 'E5E7EB' },
          alignment: { vertical: :center, wrap_text: true }
        )

        sheet.add_row(data[:headers], style: Array.new(data[:headers].length, header_style))
        data[:rows].each do |row|
          sheet.add_row(row, style: Array.new(row.length, body_style))
        end

        sheet.column_widths(20, 12, 24, 28, 14)
        sheet.sheet_view.pane do |pane|
          pane.top_left_cell = 'A2'
          pane.state = :frozen
          pane.y_split = 1
        end
      end

      package.to_stream.read
    end
  end
end
