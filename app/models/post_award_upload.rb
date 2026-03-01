require 'fileutils'
require 'securerandom'

class PostAwardUpload < ApplicationRecord
  STORAGE_ROOT = Rails.root.join('storage', 'post_award_uploads').freeze

  belongs_to :bid_package
  belongs_to :spec_item, optional: true
  belongs_to :invite, optional: true

  enum :uploader_role, { vendor: 0, designer: 1 }, default: :vendor

  validates :file_name, presence: true

  def persist_uploaded_file!(uploaded_file)
    return unless uploaded_file.respond_to?(:read)

    FileUtils.mkdir_p(STORAGE_ROOT)
    extension = File.extname(uploaded_file.original_filename.to_s)
    generated_name = "#{SecureRandom.uuid}#{extension}"
    absolute_path = STORAGE_ROOT.join(generated_name)

    File.binwrite(absolute_path, uploaded_file.read)

    update!(
      storage_path: generated_name,
      content_type: uploaded_file.content_type.presence || 'application/octet-stream',
      byte_size: File.size(absolute_path),
      file_name: uploaded_file.original_filename.presence || file_name
    )
  end

  def file_available?
    return false if storage_path.blank?

    File.exist?(stored_file_path)
  end

  def stored_file_path
    STORAGE_ROOT.join(storage_path.to_s)
  end
end
