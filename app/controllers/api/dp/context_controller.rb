module Api
  module Dp
    class ContextController < Api::Dp::BaseController
      # POST /api/context
      #
      # Request:
      #   { firm_id: 1234, project_name: "New Seating Package" }
      #
      # Response:
      #   [ { project_id: "dp_proj_123", project_name: "Memorial Campus Renovation" } ]
      def create
        firm_id = params.require(:firm_id).to_i
        requested_name = params.require(:project_name).to_s.strip
        return render_unprocessable!(["project_name is required"]) if requested_name.empty?

        matches = find_projects_for_firm(firm_id, requested_name)

        if matches.empty?
          project = Project.create!(
            firm_id: firm_id,
            name: requested_name,
            dp_project_id: generate_dp_project_id(firm_id)
          )
          matches = [project]
        end

        render json: matches.map { |p| { project_id: p.dp_project_id.to_s, project_name: p.name } }
      rescue ActionController::ParameterMissing => e
        render_unprocessable!([e.message])
      end

      private

      def find_projects_for_firm(firm_id, requested_name)
        scope = Project.where(firm_id: firm_id)
        return scope.order(created_at: :desc).limit(5).to_a if requested_name.blank?

        norm = normalize_name(requested_name)
        return scope.order(created_at: :desc).limit(5).to_a if norm.empty?

        scope.to_a.select do |p|
          a = normalize_name(p.name.to_s)
          next false if a.empty?
          a.include?(norm) || norm.include?(a)
        end.first(5)
      end

      def normalize_name(value)
        value.to_s.downcase.gsub(/[^a-z0-9]+/, ' ').strip
      end

      def generate_dp_project_id(firm_id)
        "dp_proj_#{firm_id}_#{SecureRandom.hex(4)}"
      end
    end
  end
end

