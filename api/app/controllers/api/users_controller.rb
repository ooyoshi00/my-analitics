module Api
    class UsersController < ApplicationController
        allow_unauthenticated_access only: [:create]

        def create
            user = User.new(user_params)
            if user.save
                start_new_session_for(user)
                render json: user_json(user), status: :created
            else
                render json: { errors: user.errors.full_messages }, status: :unprocessable_entity
            end
        end

        private
        def user_params
            params.require(:user).permit(:email_address, :password, :password_confirmation)
        end

        def user_json(user)
            { id: user.id, email_address: user.email_address }
        end
    end
end