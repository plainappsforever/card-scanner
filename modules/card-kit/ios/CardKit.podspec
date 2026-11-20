Pod::Spec.new do |s|
  s.name           = 'CardKit'
  s.version        = '1.0.0'
  s.summary        = 'Card scanner: document scanner, warp, text recognition, barcodes, sharing (copy of Offscan scan-kit)'
  s.description    = 'VisionKit scanner, Vision OCR, barcodes and document segmentation, CoreImage warp.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision', 'VisionKit', 'CoreImage', 'ImageIO'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    # The filter loops run per pixel: optimise them even in Debug builds (dev client).
    'SWIFT_OPTIMIZATION_LEVEL' => '-O',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
