module Api
  module Admin
    class ProjectsController < Api::BaseController
      def index
        projects = Project.order(created_at: :desc).limit(200)
        render json: {
          projects: projects.map { |project| { id: project.id, name: project.name } }
        }
      end

      def create
        project = Project.new(project_params)

        if project.save
          render json: { project: project }, status: :created
        else
          render_unprocessable!(project.errors.full_messages)
        end
      end

      def destroy
        project = Project.find(params[:id])
        project.destroy!

        render json: { deleted: true, project_id: project.id }
      end

      private

      def project_params
        params.require(:project).permit(:name, :description)
      end
    end
  end
end
