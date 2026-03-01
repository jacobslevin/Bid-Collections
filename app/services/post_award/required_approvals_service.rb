require 'zlib'

module PostAward
  class RequiredApprovalsService
    REQUIREMENTS = [
      { key: 'site_measure', label: 'Site Measure' },
      { key: 'cfa', label: 'CFA' },
      { key: 'strike_off', label: 'Strike Off' },
      { key: 'drawings', label: 'Drawings' },
      { key: 'prototype', label: 'Prototype' },
      { key: 'flame_certificate', label: 'Flame Certificate' },
      { key: 'finish_sample', label: 'Finish Sample' },
      { key: 'seaming_diagram', label: 'Seaming Diagram' },
      { key: 'product_data', label: 'Product Data' }
    ].freeze

    def self.requirements_for_spec_item(spec_item)
      seed = Zlib.crc32("#{spec_item.bid_package_id}:#{spec_item.id}")
      rng = Random.new(seed)
      count = 3 + rng.rand(0..2) # 3-5 requirements
      REQUIREMENTS.shuffle(random: rng).first(count).sort_by { |item| item[:label] }
    end
  end
end
