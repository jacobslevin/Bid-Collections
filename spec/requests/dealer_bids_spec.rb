require 'rails_helper'

RSpec.describe 'Dealer Bid Flow API', type: :request do
  let!(:project) { Project.create!(name: 'Hotel Tower') }
  let!(:bid_package) do
    project.bid_packages.create!(name: 'Lighting', source_filename: 'lighting.csv', imported_at: Time.current)
  end
  let!(:spec_item) do
    bid_package.spec_items.create!(
      spec_item_id: 'L-01',
      category: 'Lighting',
      manufacturer: 'Lumina',
      product_name: 'Pendant',
      sku: 'PND-100',
      description: 'Pendant light',
      quantity: 10,
      uom: 'EA'
    )
  end
  let!(:invite) do
    bid_package.invites.create!(
      dealer_name: 'Dealer A',
      dealer_email: 'dealer@example.com',
      password: 'bidpass123',
      password_confirmation: 'bidpass123'
    )
  end

  it 'unlocks, saves draft, submits, and prevents post-submit edits' do
    post "/api/invites/#{invite.token}/unlock",
         params: { password: 'bidpass123' }.to_json,
         headers: { 'CONTENT_TYPE' => 'application/json' }

    expect(response).to have_http_status(:ok)

    put "/api/invites/#{invite.token}/bid",
        params: {
          line_items: [
            {
              spec_item_id: spec_item.id,
              unit_price: '145.5000',
              lead_time_days: 14,
              dealer_notes: 'Available in stock finishes only'
            }
          ]
        }.to_json,
        headers: { 'CONTENT_TYPE' => 'application/json' }

    expect(response).to have_http_status(:ok)

    post "/api/invites/#{invite.token}/bid/submit",
         headers: { 'CONTENT_TYPE' => 'application/json' }

    expect(response).to have_http_status(:ok)

    put "/api/invites/#{invite.token}/bid",
        params: {
          line_items: [
            {
              spec_item_id: spec_item.id,
              unit_price: '130.0000'
            }
          ]
        }.to_json,
        headers: { 'CONTENT_TYPE' => 'application/json' }

    expect(response).to have_http_status(:conflict)
  end
end
