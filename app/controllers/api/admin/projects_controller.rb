module Api
  module Admin
    class ProjectsController < Api::BaseController
      def create
        project = Project.new(project_params)

        if project.save
          render json: { project: project }, status: :created
        else
          render_unprocessable!(project.errors.full_messages)
        end
      end

      private

      def project_params
        params.require(:project).permit(:name, :description)
      end
    end
  end
end
