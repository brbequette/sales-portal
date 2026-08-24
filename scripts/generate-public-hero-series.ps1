param([string[]]$Names)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$python = 'C:\Users\titan\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$cli = 'C:\Users\titan\.codex\skills\.system\imagegen\scripts\image_gen.py'
$styleReference = Join-Path $root 'public\images\hero\hero_blade.jpg'
$bladeReference = Join-Path $root 'public\product-images\cutouts-v2\SMX30NF1412EO-formatted.png'
$output = Join-Path $root 'public\images\hero\field-series'

$scenes = [ordered]@{
  'signature-series' = 'a veteran cutter making a precision doorway cut in a reinforced concrete wall at a stadium renovation, hydraulic support equipment and structural shoring in the deep background'
  'core-drilling' = 'a utility crew opening a slab beside a core-drilling setup on a hospital expansion, wet concrete texture, water-control vacuum and marked penetrations visible nearby'
  'surface-prep' = 'a restoration crew trimming a damaged warehouse slab before surface preparation, scarifier and dust extractor staged naturally in the background'
  'blade-finder' = 'a foreman and cutter evaluating aggregate at a highway repair, the active saw cut revealing reinforced concrete while organized blade cases sit subtly behind them'
  'blade-comparator' = 'two adjacent test cuts in a precast yard, one worker operating the saw while a supervisor studies cut speed and segment wear from a safe distance'
  'catalog' = 'a contractor cutting a clean expansion joint in a new distribution-center slab, palletized materials and active trades softly visible behind the cutting lane'
  'resources' = 'a field-training demonstration at a contractor yard, experienced operator showing correct cutting posture while apprentices observe from a safe marked zone'
  'rpm-calculator' = 'a meticulous saw setup beside a bridge-deck repair, tachometer and inspection tools resting safely on a nearby cart while the operator begins the cut'
  'unit-converter' = 'a layout-intensive curb and sidewalk project, chalk dimensions and measuring tools visible while the cutter follows a precise marked line'
  'knowledge-test' = 'a safety toolbox training scene transitioning into a live supervised cut, cones, PPE station and job briefing board softly visible behind the operator'
  'about' = 'an experienced American concrete cutter working before sunrise on a civic building renovation, quiet crew activity and durable well-used equipment communicating craftsmanship'
  'careers' = 'a younger cutter working confidently under an experienced foreman on a major infrastructure job, teamwork and mentorship evident without posing for the camera'
  'contact' = 'a service crew completing an urgent municipal street repair at dawn, Titan delivery truck and organized support crew softly visible in the distance'
  'default' = 'a demanding nighttime industrial maintenance cut on a heavy reinforced equipment pad, work lights, dust control and disciplined crew coordination'
}

if (-not $Names -or $Names.Count -eq 0) { $Names = @($scenes.Keys) }
$Names = @($Names | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$keyLine = Get-Content -LiteralPath (Join-Path $root '.env') | Where-Object { $_ -match '^OPENAI_API_KEY=' } | Select-Object -Last 1
if (-not $keyLine) { throw 'OPENAI_API_KEY is not configured in .env.' }
$env:OPENAI_API_KEY = ($keyLine -split '=', 2)[1].Trim().Trim('"').Trim("'")
New-Item -ItemType Directory -Force -Path $output | Out-Null

foreach ($name in $Names) {
  if (-not $scenes.Contains($name)) { throw "Unknown hero scene: $name" }
  $destination = Join-Path $output "$name.jpg"
  if (Test-Path -LiteralPath $destination) { Write-Output "SKIP existing $name"; continue }
  $prompt = @"
Use case: photorealistic-natural
Asset type: wide website hero background
Primary request: Create an original cinematic field photograph of $($scenes[$name]). The active tool is exactly one handheld orange-and-white STIHL TS 420 cutoff saw fitted with the 14-inch Titan Diamond USA THE TITAN blade from Image 2.
Input images: Image 1 is the visual-settings reference only. Match its dark industrial exposure, warm controlled sparks, cool charcoal shadows, realistic grit, lens character, depth, contrast and premium finish without copying its scene. Image 2 is the exact blade-design reference. Preserve its red-white-blue face, central star, segment pattern, proportions and recognizable THE TITAN identity, mounted correctly inside the saw guard.
Style/medium: highly photorealistic documentary industrial advertising photography; authentic American field work; real equipment geometry and worn material texture; no CGI look.
Composition/framing: 16:9 wide hero. Worker and saw occupy the right half. The blade is large and crisp but physically plausible, partially guarded and visibly contacting the material. Leave dark uncluttered negative space on the left for website copy.
Lighting/mood: same creation settings as Image 1; moody directional work light, restrained amber sparks, cool steel shadows, subtle haze and cinematic color grade.
Patriotic detail: one subtle distant American flag attached naturally to legitimate jobsite equipment or structure; environmental and secondary, never a poster or focal point.
Constraints: exactly one TS 420-style handheld saw and one 14-inch blade; correct arbor and guard relationship; realistic worn PPE and body mechanics; unique field environment; no added typography, slogans, watermarks, floating logos, duplicate tools, giant walk-behind saws, impossible hands or unsafe operation.
Avoid: studio scene, fantasy, illustration, excessive fire, explosion, flag-dominant composition, pristine unused equipment, malformed saw, warped blade, random text.
"@
  & $python $cli edit --model gpt-image-2 --image $styleReference --image $bladeReference --prompt $prompt --size 2048x1152 --quality high --output-format jpeg --output-compression 90 --out $destination
  if ($LASTEXITCODE -ne 0) { throw "Image generation failed for $name" }
}
