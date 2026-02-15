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
end
