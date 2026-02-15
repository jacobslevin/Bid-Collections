require 'rails_helper'

RSpec.describe 'Admin Projects API', type: :request do
  describe 'POST /api/projects' do
    it 'creates a project' do
      post '/api/projects',
           params: { project: { name: 'Hospital North Wing', description: 'Q2 package' } }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      expect(response).to have_http_status(:created)
      expect(json_response.dig('project', 'name')).to eq('Hospital North Wing')
    end
  end
end
