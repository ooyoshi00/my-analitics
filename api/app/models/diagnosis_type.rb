class DiagnosisType < ApplicationRecord
  belongs_to :diagnosis

  validates :code, presence: true, uniqueness: { scope: :diagnosis_id }
  validates :name, presence: true
  validates :description, presence: true
end
