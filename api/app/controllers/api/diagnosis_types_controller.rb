module Api
    class DiagnosisTypesController < ApplicationController
        def index
            types = DiagnosisType.includes(:diagnosis).order(:id)
            render json: types.as_json(
                only: [:id, :code, :name, :description],
                include:{
                    diagnosis: { only: [:id, :name, :slug] }
                }
            )
        end
    end
end