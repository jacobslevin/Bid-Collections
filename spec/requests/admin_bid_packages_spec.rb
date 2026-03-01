require 'rails_helper'

RSpec.describe 'Admin Bid Packages API', type: :request do
  describe 'POST /api/projects/:id/bid_packages/preview' do
    let!(:project) { Project.create!(name: 'Campus Modernization') }

    it 'previews a valid CSV payload' do
      csv = <<~CSV
        category,manufacturer,product_name,sku,description,quantity,uom
        Seating,Acme,Task Chair,CH-100,Mesh back task chair,25,EA
      CSV

      post "/api/projects/#{project.id}/bid_packages/preview",
           params: { csv_content: csv }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      expect(response).to have_http_status(:ok)
      expect(json_response['valid']).to eq(true)
      expect(json_response['row_count']).to eq(1)
    end

    it 'supports Designer Pages-style header aliases' do
      csv = <<~CSV
        Product ID,Code,Product Name,Image URL,DP URL,Brand,DP Categories,Notes,Description,Attributes,Nested Products
        14056889,*CL-1,INTELLECT WAVE,https://content.designerpages.com/assets/82412733/Wavechaircant15.jpg,http://designerpages.com/manufacturers/ki,KI,CHAIR - LEARNING,,Cantilever chair,Model #: IWC18CHPEVNG,Everglade Shade - KI|Chrome - KI
      CSV

      post "/api/projects/#{project.id}/bid_packages/preview",
           params: { csv_content: csv }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      expect(response).to have_http_status(:ok)
      expect(json_response['valid']).to eq(true)
      expect(json_response['source_profile']).to eq('designer_pages')
      expect(json_response['sample_rows'][0]['manufacturer']).to eq('KI')
      expect(json_response['sample_rows'][0]['quantity'].to_f).to eq(1.0)
      expect(json_response['sample_rows'][0]['uom']).to eq('EA')
    end

    it 'skips blank Designer Pages rows and allows missing description' do
      csv = <<~CSV
        Product ID,Code,Product Name,Brand,DP Categories,Description
        14056889,*CL-1,INTELLECT WAVE,KI,CHAIR - LEARNING,
        ,,,,,
      CSV

      post "/api/projects/#{project.id}/bid_packages/preview",
           params: { csv_content: csv, source_profile: 'designer_pages' }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      expect(response).to have_http_status(:ok)
      expect(json_response['valid']).to eq(true)
      expect(json_response['row_count']).to eq(1)
      expect(json_response['sample_rows'][0]['description']).to eq('')
    end

    it 'keeps rows with product id even when other fields are missing' do
      csv = <<~CSV
        Product ID,Code,Product Name,Brand,DP Categories,Description
        14056889,,,,,
      CSV

      post "/api/projects/#{project.id}/bid_packages/preview",
           params: { csv_content: csv, source_profile: 'designer_pages' }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      expect(response).to have_http_status(:ok)
      expect(json_response['valid']).to eq(true)
      expect(json_response['row_count']).to eq(1)
      row = json_response['sample_rows'][0]
      expect(row['spec_item_id']).to eq('14056889')
      expect(row['sku']).to eq('14056889')
      expect(row['product_name']).to eq('Product 14056889')
      expect(row['manufacturer']).to eq('Unknown')
      expect(row['category']).to eq('Uncategorized')
    end

    it 'deduplicates duplicate product ids in designer pages profile' do
      csv = <<~CSV
        Product ID,Code,Product Name,Brand,DP Categories,Description
        14056889,*CL-1,INTELLECT WAVE,KI,CHAIR - LEARNING,Chair
        14056889,*CL-2,INTELLECT WAVE 2,KI,CHAIR - LEARNING,Chair 2
      CSV

      post "/api/projects/#{project.id}/bid_packages/preview",
           params: { csv_content: csv, source_profile: 'designer_pages' }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      expect(response).to have_http_status(:ok)
      expect(json_response['valid']).to eq(true)
      ids = json_response['sample_rows'].map { |row| row['spec_item_id'] }
      expect(ids).to eq(%w[14056889 14056889-2])
    end

    it 'returns validation errors for malformed rows' do
      csv = <<~CSV
        category,manufacturer,product_name,sku,description,quantity,uom
        Seating,Acme,Task Chair,CH-100,Mesh back task chair,not-a-number,EA
      CSV

      post "/api/projects/#{project.id}/bid_packages/preview",
           params: { csv_content: csv }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json_response['errors'].join).to include('quantity must be numeric and > 0')
    end
  end

  describe 'POST /api/projects/:id/bid_packages' do
    let!(:project) { Project.create!(name: 'Campus Modernization') }

    it 'imports a valid CSV payload' do
      csv = <<~CSV
        category,manufacturer,product_name,sku,description,quantity,uom
        Seating,Acme,Task Chair,CH-100,Mesh back task chair,25,EA
      CSV

      post "/api/projects/#{project.id}/bid_packages",
           params: {
             name: 'Furniture Package A',
             source_filename: 'spec_export.csv',
             csv_content: csv
           }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      expect(response).to have_http_status(:created)
      expect(json_response['imported_items_count']).to eq(1)
      expect(BidPackage.count).to eq(1)
      expect(SpecItem.count).to eq(1)
    end

    it 'returns validation errors for malformed rows' do
      csv = <<~CSV
        category,manufacturer,product_name,sku,description,quantity,uom
        Seating,Acme,Task Chair,CH-100,Mesh back task chair,not-a-number,EA
      CSV

      post "/api/projects/#{project.id}/bid_packages",
           params: {
             name: 'Bad Package',
             source_filename: 'bad.csv',
             csv_content: csv
           }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json_response['errors'].join).to include('quantity must be numeric and > 0')
    end
  end

  describe 'Awarding' do
    let!(:project) { Project.create!(name: 'Campus Modernization') }
    let!(:bid_package) do
      project.bid_packages.create!(name: 'Furniture Package A', source_filename: 'spec_export.csv', imported_at: Time.current)
    end
    let!(:invite_a) do
      bid_package.invites.create!(
        dealer_name: 'Dealer A',
        dealer_email: 'dealer-a@example.com',
        password: 'bidpass123',
        password_confirmation: 'bidpass123'
      )
    end
    let!(:invite_b) do
      bid_package.invites.create!(
        dealer_name: 'Dealer B',
        dealer_email: 'dealer-b@example.com',
        password: 'bidpass123',
        password_confirmation: 'bidpass123'
      )
    end
    let!(:bid_a) do
      invite_a.create_bid!(state: :submitted, submitted_at: Time.current).tap do |bid|
        bid.bid_submission_versions.create!(
          version_number: 1,
          submitted_at: Time.current,
          total_amount: 12_500.25,
          line_items_snapshot: [{}]
        )
      end
    end
    let!(:bid_b) do
      invite_b.create_bid!(state: :submitted, submitted_at: Time.current).tap do |bid|
        bid.bid_submission_versions.create!(
          version_number: 1,
          submitted_at: Time.current,
          total_amount: 11_450.75,
          line_items_snapshot: [{}]
        )
      end
    end

    it 'awards one bid and marks other bids as not selected' do
      post "/api/bid_packages/#{bid_package.id}/award",
           params: {
             bid_id: bid_a.id,
             note: 'Best value',
             awarded_by: 'designer@example.com'
           }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      expect(response).to have_http_status(:ok)
      expect(bid_package.reload.awarded_bid_id).to eq(bid_a.id)
      expect(bid_a.reload.selection_status).to eq('awarded')
      expect(bid_b.reload.selection_status).to eq('not_selected')

      event = bid_package.bid_award_events.order(:id).last
      expect(event.event_type).to eq('award')
      expect(event.to_bid_id).to eq(bid_a.id)
      expect(event.awarded_amount_snapshot.to_s).to eq('12500.25')
    end

    it 're-awards and retains award history' do
      post "/api/bid_packages/#{bid_package.id}/award",
           params: { bid_id: bid_a.id, awarded_by: 'designer@example.com' }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      patch "/api/bid_packages/#{bid_package.id}/change_award",
            params: {
              bid_id: bid_b.id,
              note: 'Updated scope',
              awarded_by: 'designer@example.com'
            }.to_json,
            headers: { 'CONTENT_TYPE' => 'application/json' }

      expect(response).to have_http_status(:ok)
      expect(bid_package.reload.awarded_bid_id).to eq(bid_b.id)
      expect(bid_a.reload.selection_status).to eq('not_selected')
      expect(bid_b.reload.selection_status).to eq('awarded')
      expect(bid_package.bid_award_events.count).to eq(2)
      expect(bid_package.bid_award_events.order(:id).last.event_type).to eq('reaward')
    end

    it 'can remove an existing award without reassigning' do
      post "/api/bid_packages/#{bid_package.id}/award",
           params: { bid_id: bid_a.id, awarded_by: 'designer@example.com' }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      patch "/api/bid_packages/#{bid_package.id}/clear_award",
            params: { note: 'Reopening bidding', awarded_by: 'designer@example.com' }.to_json,
            headers: { 'CONTENT_TYPE' => 'application/json' }

      expect(response).to have_http_status(:ok)
      expect(bid_package.reload.awarded_bid_id).to be_nil
      expect(bid_package.awarded_at).to be_nil
      expect(bid_a.reload.selection_status).to eq('pending')
      expect(bid_b.reload.selection_status).to eq('pending')
      expect(bid_package.bid_award_events.order(:id).last.event_type).to eq('unaward')
    end

    it 'approves a required line-item requirement with timestamp' do
      requirement_key = PostAward::RequiredApprovalsService.requirements_for_spec_item(
        bid_package.spec_items.create!(
          spec_item_id: 'S-01',
          category: 'Seating',
          manufacturer: 'Acme',
          product_name: 'Chair',
          sku: 'CH-1',
          description: 'Chair',
          quantity: 10,
          uom: 'EA'
        )
      ).first[:key]

      post "/api/bid_packages/#{bid_package.id}/award",
           params: { bid_id: bid_a.id, awarded_by: 'designer@example.com' }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      item = bid_package.spec_items.find_by!(spec_item_id: 'S-01')
      patch "/api/bid_packages/#{bid_package.id}/spec_items/#{item.id}/requirements/#{requirement_key}/approve",
            params: {}.to_json,
            headers: { 'CONTENT_TYPE' => 'application/json' }

      expect(response).to have_http_status(:ok)
      approval = SpecItemRequirementApproval.find_by(spec_item_id: item.id, requirement_key: requirement_key)
      expect(approval).to be_present
      expect(approval.approved_at).to be_present
    end

    it 'clears approvals only for the currently awarded vendor' do
      item = bid_package.spec_items.create!(
        spec_item_id: 'S-02',
        category: 'Seating',
        manufacturer: 'Acme',
        product_name: 'Stool',
        sku: 'ST-1',
        description: 'Stool',
        quantity: 5,
        uom: 'EA'
      )
      requirement_key = PostAward::RequiredApprovalsService.requirements_for_spec_item(item).first[:key]

      post "/api/bid_packages/#{bid_package.id}/award",
           params: { bid_id: bid_a.id, awarded_by: 'designer@example.com' }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      patch "/api/bid_packages/#{bid_package.id}/spec_items/#{item.id}/requirements/#{requirement_key}/approve",
            params: {}.to_json,
            headers: { 'CONTENT_TYPE' => 'application/json' }

      patch "/api/bid_packages/#{bid_package.id}/change_award",
            params: { bid_id: bid_b.id, awarded_by: 'designer@example.com' }.to_json,
            headers: { 'CONTENT_TYPE' => 'application/json' }

      patch "/api/bid_packages/#{bid_package.id}/clear_current_award_approvals",
            params: {}.to_json,
            headers: { 'CONTENT_TYPE' => 'application/json' }

      expect(response).to have_http_status(:ok)
      expect(SpecItemRequirementApproval.where(bid_id: bid_a.id).count).to eq(1)
      expect(SpecItemRequirementApproval.where(bid_id: bid_b.id).count).to eq(0)
    end
  end
end
