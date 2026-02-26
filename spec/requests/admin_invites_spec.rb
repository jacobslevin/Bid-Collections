require 'rails_helper'

RSpec.describe 'Admin Invites API', type: :request do
  let!(:project) { Project.create!(name: 'Hotel Tower') }
  let!(:bid_package) do
    project.bid_packages.create!(name: 'Furniture', source_filename: 'furniture.csv', imported_at: Time.current)
  end
  let!(:spec_item) do
    bid_package.spec_items.create!(
      spec_item_id: 'CH-01',
      category: 'Seating',
      manufacturer: 'Acme',
      product_name: 'Task Chair',
      sku: 'CH-01',
      description: 'Task chair',
      quantity: 5,
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

  before do
    post "/api/invites/#{invite.token}/unlock",
         params: { password: 'bidpass123' }.to_json,
         headers: { 'CONTENT_TYPE' => 'application/json' }

    put "/api/invites/#{invite.token}/bid",
        params: {
          line_items: [
            { spec_item_id: spec_item.id, unit_price: '100.00', lead_time_days: 10, dealer_notes: 'First pass' }
          ]
        }.to_json,
        headers: { 'CONTENT_TYPE' => 'application/json' }

    post "/api/invites/#{invite.token}/bid/submit",
         headers: { 'CONTENT_TYPE' => 'application/json' }
  end

  it 'returns bid submission history for an invite' do
    get "/api/bid_packages/#{bid_package.id}/invites/#{invite.id}/history"

    expect(response).to have_http_status(:ok)
    expect(json_response['current_version']).to eq(1)
    expect(json_response['versions'].length).to eq(1)
    expect(json_response['versions'][0]['version_number']).to eq(1)
    expect(json_response['versions'][0]['line_items'][0]['code_tag']).to eq('CH-01')
  end

  it 'reopens a submitted bid' do
    post "/api/bid_packages/#{bid_package.id}/invites/#{invite.id}/reopen",
         params: { reason: 'Please revise with updated freight' }.to_json,
         headers: { 'CONTENT_TYPE' => 'application/json' }

    expect(response).to have_http_status(:ok)
    expect(json_response['reopened']).to eq(true)

    bid = invite.reload.bid
    expect(bid.state).to eq('draft')
    expect(bid.last_reopened_at).to be_present
    expect(bid.last_reopen_reason).to eq('Please revise with updated freight')
  end

  it 'disables and enables an invite without deleting bid data' do
    patch "/api/bid_packages/#{bid_package.id}/invites/#{invite.id}/disable",
          headers: { 'CONTENT_TYPE' => 'application/json' }

    expect(response).to have_http_status(:ok)
    expect(json_response['disabled']).to eq(true)
    expect(invite.reload.disabled).to eq(true)
    expect(invite.bid).to be_present

    get "/api/invites/#{invite.token}"
    expect(response).to have_http_status(:forbidden)

    patch "/api/bid_packages/#{bid_package.id}/invites/#{invite.id}/enable",
          headers: { 'CONTENT_TYPE' => 'application/json' }

    expect(response).to have_http_status(:ok)
    expect(json_response['enabled']).to eq(true)
    expect(invite.reload.disabled).to eq(false)
  end
end
