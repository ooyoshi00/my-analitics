class CreateDiagnoses < ActiveRecord::Migration[8.1]
  def change
    create_table :diagnoses do |t|
      t.string :name, null: false
      t.string :slug, null: false

      t.timestamps
    end
    add_index :diagnoses, :slug, unique: true
  end
end
